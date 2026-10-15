import { Schema, model } from "mongoose";

const activityLogSchema = new Schema(
  {
    actorId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    actorRole: { type: String, enum: ["SUPER_ADMIN", "AGENT"], required: true },
    action: { type: String, required: true, trim: true },
    entity: { type: String, required: true, trim: true },
    entityId: { type: String, required: true },
    metadata: { type: Schema.Types.Mixed, default: {} },
    ipAddress: { type: String, trim: true },
  },
  { timestamps: true, versionKey: false }
);

activityLogSchema.index({ actorId: 1, createdAt: -1 });
activityLogSchema.index({ entity: 1, entityId: 1 });

activityLogSchema.set("toJSON", {
  transform: (_doc, result) => {
    const output = result as unknown as Record<string, unknown>;
    output["id"] = String(output["_id"]);
    delete output["_id"];
    return output;
  },
});

export const ActivityLogModel = model("ActivityLog", activityLogSchema);
