import { ApolloServer } from '@apollo/server';
import { startStandaloneServer } from '@apollo/server/standalone';
import { GraphQLError } from 'graphql';
import {v1 as uuid} from 'uuid';
import axios from 'axios';
import { persons } from './persons.js';

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
  type Query {
    personCount: Int!
    allPersons(phone: YesNo): [Person]!
    findPerson(name: String!): Person
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
  }
`;

const resolvers = {
  Query: {
    personCount: () => persons.length,
    allPersons: async (root, args) => {
      // const {data: personsFromRestApi} = await axios.get('http://localhost:3000/persons')
      // console.log(personsFromRestApi)
      if(!args.phone) return persons
      const byPhone = person => 
        args.phone === "YES" ? person.phone : !person.phone
      return persons.filter(byPhone)
    },
    findPerson: (root, args) => {
      const {name} = args
      return persons.find(person => person.name === name)
    }
  },
  Mutation: {
    addPerson: (root, args) => {
      if(persons.find(p => p.name === args.name)){
        throw new GraphQLError('Name must be unique', {
          extensions: {
            code: 'GRAPHQL_VALIDATION_FAILED'
          }
        })
      }
      // const {name, phone, street, city} = args
      const person = {...args, id: uuid()}
      persons.push(person)
      return person
    },
    editNumber: (root, args) => {
      const personIndex = persons.findIndex(p => p.name === args.name)
      if(personIndex === -1) return null
      const person = persons[personIndex]
      const updatedPerson = {...person, phone: args.phone}
      persons[personIndex] = updatedPerson
      return updatedPerson
    }
  },
  Person: {
    address: (root) => {
      return {
        street: root.street,
        city: root.city
      }
    }
  }
};

const server = new ApolloServer({
  typeDefs,
  resolvers,
});
const { url } = await startStandaloneServer(server, {
  listen: { port: 4000 },
});
console.log(`🚀  Server ready at: ${url}`);