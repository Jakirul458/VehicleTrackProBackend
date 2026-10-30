import { Schema, model } from "mongoose";

const authSessionSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    userRole: { type: String, enum: ["SUPER_ADMIN", "AGENT"], required: true },
    browser: { type: String, required: true },
    operatingSystem: { type: String, required: true },
    deviceType: { type: String, required: true },
    userAgent: { type: String, maxlength: 500 },
    ipAddress: { type: String, trim: true },
    location: {
      latitude: Number,
      longitude: Number,
      accuracy: Number,
    },
    createdAt: { type: Date, required: true, default: Date.now },
    lastActivityAt: { type: Date, required: true, default: Date.now },
    expiresAt: { type: Date, required: true },
    absoluteExpiresAt: { type: Date, required: true },
    revokedAt: { type: Date, default: null },
  },
  { versionKey: false },
);

authSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
authSessionSchema.index({ userId: 1, revokedAt: 1, expiresAt: 1 });

export interface LoginLocation {
  latitude: number;
  longitude: number;
  accuracy: number;
}

export const AuthSessionModel = model("AuthSession", authSessionSchema);
