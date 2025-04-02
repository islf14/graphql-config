import mongoose from "mongoose";
import mongooseUniqueValidator from "mongoose-unique-validator";
const { Schema } = mongoose;

const schema = new Schema({
  name: {
    type: String,
    required: true,
    unique: true,
    minlength: 5
  },
  phone: {
    type: String,
    minlength: 5
  },
  street: {
    type: String,
    required: true,
    minlength: 5
  },
  city: {
    type: String,
    required: true,
    minlength: 3
  }
});

schema.plugin(mongooseUniqueValidator)
export default mongoose.model('Person', schema);