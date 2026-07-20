import mongoose from 'mongoose';
import env from "../configs/env.config.js"

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(env.mongoUri)
    console.log(`MongoDB Connected: ${conn.connection.host}`);
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
};

export default connectDB;