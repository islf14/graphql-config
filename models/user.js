import mongoose from "mongoose";
import mongooseUniqueValidator from "mongoose-unique-validator";
const { Schema } = mongoose;

const schema = new Schema({
  username: {
    type: String,
    required: true,
    unique: true,
    minlength: 3
  },
  friends: [
    {
      ref: 'Person',
      type: mongoose.Schema.Types.ObjectId
    }
  ]
})

schema.plugin(mongooseUniqueValidator)
export default mongoose.model('User', schema);