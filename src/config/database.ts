import mongoose from "mongoose";
import { env } from "./env.js";
import { ActivityLogModel } from "../models/ActivityLog.js";
import { AuthSessionModel } from "../models/AuthSession.js";

export async function connectDatabase() {
  mongoose.set("strictQuery", true);
  await mongoose.connect(env.MONGODB_URI);
  await Promise.all([
    ActivityLogModel.collection.createIndex(
      { createdAt: 1 },
      { expireAfterSeconds: 90 * 24 * 60 * 60 },
    ),
    AuthSessionModel.collection.createIndex(
      { expiresAt: 1 },
      { expireAfterSeconds: 0 },
    ),
  ]);
  console.info("MongoDB connected");
}
