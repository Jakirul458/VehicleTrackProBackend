import { Schema, model } from "mongoose";

const partySchema = new Schema(
  {
    fullName: { type: String, trim: true, default: "" },
    businessName: { type: String, trim: true, default: "" },
    email: { type: String, trim: true, lowercase: true, default: "" },
    mobile: { type: String, trim: true, default: "" },
    address: { type: String, trim: true, default: "" },
    city: { type: String, trim: true, default: "" },
    state: { type: String, trim: true, default: "" },
    pinCode: { type: String, trim: true, default: "" },
    gstin: { type: String, trim: true, uppercase: true, default: "" },
    signatureImage: { type: String, default: "" },
  },
  { _id: false },
);

const subscriptionPaymentSchema = new Schema(
  {
    agentId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    planId: {
      type: Schema.Types.ObjectId,
      ref: "SubscriptionPlan",
      required: true,
    },
    planName: { type: String, required: true, trim: true },
    planDescription: { type: String, required: true, trim: true },
    amount: { type: Number, required: true, min: 1 },
    gstEnabled: { type: Boolean, default: false },
    gstRate: { type: Number, min: 0, max: 100, default: 0 },
    gstAmount: { type: Number, min: 0, default: 0 },
    totalAmount: { type: Number, min: 0, default: 0 },
    authorizedSignatory: {
      type: String,
      trim: true,
      maxlength: 120,
      default: "",
    },
    utr: { type: String, required: true, trim: true, unique: true },
    paymentApp: { type: String, required: true, trim: true, maxlength: 40 },
    paymentDate: { type: Date, required: true },
    screenshot: { type: String, default: "" },
    customer: { type: partySchema, required: true },
    seller: { type: partySchema, required: true },
    status: {
      type: String,
      enum: ["PENDING", "APPROVED", "REJECTED"],
      default: "PENDING",
    },
    rejectReason: { type: String, trim: true, default: "" },
    invoiceNumber: { type: String, trim: true, default: "" },
    approvedAt: { type: Date },
    periodStart: { type: Date },
    periodEnd: { type: Date },
  },
  { timestamps: true, versionKey: false },
);

subscriptionPaymentSchema.set("toJSON", {
  transform: (_doc, result) => {
    const output = result as unknown as Record<string, unknown>;
    output["id"] = String(output["_id"]);
    delete output["_id"];
    delete output["screenshot"];
    const seller = output["seller"];
    if (seller && typeof seller === "object") {
      delete (seller as Record<string, unknown>)["signatureImage"];
    }
    return output;
  },
});

export const SubscriptionPaymentModel = model(
  "SubscriptionPayment",
  subscriptionPaymentSchema,
);
