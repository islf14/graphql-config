import { ApolloServer } from '@apollo/server';
import { startStandaloneServer } from '@apollo/server/standalone';
import { GraphQLError } from 'graphql';
import './db.js';
import Person from './models/person.js';
import User from './models/user.js';
import jwt from 'jsonwebtoken';
import { PubSub } from 'graphql-subscriptions';
import { expressMiddleware } from '@apollo/server/express4';
import { ApolloServerPluginDrainHttpServer } from '@apollo/server/plugin/drainHttpServer';
import { createServer } from 'http';
import express from "express";
import { makeExecutableSchema } from '@graphql-tools/schema';
import { WebSocketServer } from 'ws';
import { useServer } from 'graphql-ws/use/ws';
import http from "http";
import cors from "cors";

const pubsub = new PubSub();
const JWT_SECRET = 'HERE_SECRET_WORD_FOR_GENERATE_TOKEN';
const SUBSCRIPTION_EVENTS = {
  ADDED_PERSON: 'ADDED_PERSON'
}

const typeDefs = 
`#graphql

  enum YesNo{
    YES
    NO
  }
  type Address {
    street: String!
    city: String!
  }
  type Person {
    name: String!
    phone: String
    address: Address!
    id: ID!
  }
  type User {
    username: String!
    friends: [Person]!
    id: ID!
  }
  type Token {
    value: String!
  }

  type Query {
    personCount: Int!
    allPersons(phone: YesNo): [Person]!
    findPerson(name: String!): Person
    me: User
  }

  type Mutation {
    addPerson(
      name: String!
      phone: String
      street: String!
      city: String!
    ): Person
    editNumber(
      name: String!
      phone: String!
    ): Person
    createUser(
      username: String!
    ): User
    login(
      username: String!
      password: String!
    ): Token
    addAsFriend(
      name: String!
    ): User
  }

  type Subscription {
    addedPerson: Person!
  }

`;

const resolvers = {

  Query: {
    personCount: () => Person.collection.countDocuments(),
    allPersons: async (root, args) => {
      if(!args.phone) return Person.find({})
      return  Person.find({ phone: { $exists: args.phone === "YES" } })
    },
    findPerson: async(root, args) => {
      const {name} = args
      return await Person.findOne({name})
    },
    me: (root, args, context) => {
      return context.currentUser
    }
  },

  Mutation: {
    
    addPerson: async (root, args, context) => {
      const {currentUser} = context
      if(!currentUser) throw  new GraphQLError("not authenticated")
      const person = new Person({...args})
      try{
        await person.save()
        currentUser.friends = currentUser.friends.concat(person)
        await currentUser.save()
      }catch (error) {
        throw new GraphQLError(error.message, {
          extensions: {
            code: 'BAD_USER_INPUT'
          }
        })
      }
      pubsub.publish(SUBSCRIPTION_EVENTS.ADDED_PERSON, { addedPerson: person})
      return person
    },

    editNumber: async (root, args) => {
      const person = await Person.findOne({name: args.name})
      if(!person) return
      person.phone = args.phone
      try{
        await person.save()
      }catch (error) { 
        throw new GraphQLError(error.message, {
          extensions: {
            code: 'BAD_USER_INPUT'
          }
        })
      }
      return person
    },

    createUser: (root, args) => {
      const user = new User({ username: args.username })
      return user.save().catch(error => {
        throw new GraphQLError(error.message, {
          extensions: {
            code: 'BAD_USER_INPUT'
          }
        })
      })
    },

    login: async (root, args) => {
      const user = await User.findOne({username: args.username})

      if(!user || args.password !== 'secret') {
        throw new GraphQLError('wrong credentials')
      }

      const userForToken = {
        username: user.username,
        id: user._id
      }

      return {
        value: jwt.sign(userForToken, JWT_SECRET)
      }
    },

    addAsFriend: async (root, args, context) => {
      const {currentUser} = context
      if(!currentUser) throw  new GraphQLError("not authenticated")
      
      const person = await Person.findOne({ name: args.name })
      const nonFriendlyAlready = person => !currentUser.friends
        .map(p => `${p._id}`)
        .includes(`${person._id}`)
      if(nonFriendlyAlready(person)) {
        currentUser.friends = currentUser.friends.concat(person)
        await currentUser.save()
      }
      return currentUser
    }
  },

  Person: {
    address: (root) => {
      return {
        street: root.street,
        city: root.city
      }
    }
  },

  Subscription: {
    addedPerson: {
      subscribe: () => pubsub.asyncIterableIterator ([SUBSCRIPTION_EVENTS.ADDED_PERSON])
    }
  }
};

////////// SERVER expressMiddleware - SUBSCRIPTIONS /////////////

const schema = makeExecutableSchema({ typeDefs, resolvers });
const app = express();
const httpServer = createServer(app);

const wsServer = new WebSocketServer({
  server: httpServer,
  path: '/subscriptions',
});
const serverCleanup = useServer({ schema }, wsServer);

const server = new ApolloServer({
  schema,
  plugins: [
    ApolloServerPluginDrainHttpServer({ httpServer }),
    {
      async serverWillStart() {
        return {
          async drainServer() {
            await serverCleanup.dispose();
          },
        };
      },
    },
  ],
});

await server.start();

app.use(
  '/',
  cors(),
  express.json(),
  expressMiddleware(server, {
    context: async ({ req }) => {
      const auth = req ? req.headers.authorization: null
      if(auth && auth.toLowerCase().startsWith('bearer ')) {
        const token = auth.substring(7)
        const {id} = jwt.verify(token, JWT_SECRET)
        const currentUser = await User.findById(id).populate('friends')
        return { currentUser }
      }
    },
  }),
);

const PORT = 4000;
httpServer.listen(PORT, () => {
  console.log(`Server is now running on http://localhost:${PORT}`);
});

/////////////////// SERVER expressMiddleware ///////////////////

// const app = express();
// const httpServer = http.createServer(app);
// const server = new ApolloServer ({
//   typeDefs,
//   resolvers,
//   plugins: [ApolloServerPluginDrainHttpServer({ httpServer })]
// });
// await server.start();
// app.use(
//   '/',
//   cors(),
//   express.json(),
//   expressMiddleware(server, {
//     context: async ({ req }) => {
//       const auth = req ? req.headers.authorization: null
//       if(auth && auth.toLowerCase().startsWith('bearer ')) {
//         const token = auth.substring(7)
//         const {id} = jwt.verify(token, JWT_SECRET)
//         const currentUser = await User.findById(id).populate('friends')
//         return { currentUser }
//       }
//     },
//   }),
// );
// await new Promise((resolve) =>
//   httpServer.listen({ port: 4000 }, resolve),
// );
// console.log(`🚀 Server ready at http://localhost:4000/`);

//////////// SERVER startStandaloneServer ////////////////

// const server = new ApolloServer({
//   typeDefs,
//   resolvers,
// });
// const { url } = await startStandaloneServer(server, {
//   listen: { port: 4000 },
//   context: async ({ req }) => {
//     const auth = req ? req.headers.authorization: null
//     if(auth && auth.toLowerCase().startsWith('bearer ')) {
//       const token = auth.substring(7)
//       const {id} = jwt.verify(token, JWT_SECRET)
//       const currentUser = await User.findById(id).populate('friends')
//       return { currentUser }
//     }
//   },
// });
// console.log(`🚀  Server ready at: ${url}`);

//////////////////////////