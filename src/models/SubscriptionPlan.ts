import { Schema, model } from "mongoose";

const subscriptionPlanSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 100 },
    description: { type: String, required: true, trim: true, maxlength: 300 },
    original_price: { type: Number, required: true, min: 0 },
    current_price: { type: Number, required: true, min: 0 },
    offer_tag: { type: String, trim: true, maxlength: 80, default: "" },
  },
  { timestamps: true, versionKey: false },
);

subscriptionPlanSchema.set("toJSON", {
  transform: (_doc, result) => {
    const output = result as unknown as Record<string, unknown>;
    output["id"] = String(output["_id"]);
    delete output["_id"];
    return output;
  },
});

export const SubscriptionPlanModel = model(
  "SubscriptionPlan",
  subscriptionPlanSchema,
);
