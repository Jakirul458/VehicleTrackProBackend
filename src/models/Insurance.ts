import { Schema, model } from "mongoose";

const insuranceSchema = new Schema(
  {
    agentId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    customerId: { type: Schema.Types.ObjectId, ref: "Customer" },
    legacyVehicleId: { type: String, select: false },
    customerName: { type: String, trim: true, maxlength: 120 },
    mobile: { type: String, trim: true, maxlength: 20 },
    vehicleNumber: { type: String, trim: true, uppercase: true, maxlength: 24 },
    chassisNumber: { type: String, trim: true, uppercase: true, maxlength: 64 },
    engineNumber: { type: String, trim: true, uppercase: true, maxlength: 64 },
    policyNumber: { type: String, trim: true, maxlength: 80 },
    insuranceCompany: { type: String, trim: true, maxlength: 120 },
    policyType: { type: String, enum: ["Comprehensive", "Third Party", "Own Damage"] },
    premium: { type: Number, min: 0, default: 0 },
    portalPaid: { type: Number, min: 0 },
    customerPaid: { type: Number, min: 0 },
    commission: { type: Number, min: 0 },
    paymentDate: { type: Date, default: Date.now, index: true },
    startDate: { type: Date },
    expiryDate: { type: Date, index: true },
    address: { type: String, trim: true, maxlength: 500 },
    remarks: { type: String, maxlength: 1000 },
    reminderDoneAt: { type: Date },
    deletedAt: { type: Date, default: null, index: true },
  },
  { timestamps: true, versionKey: false },
);

insuranceSchema.index(
  { agentId: 1, policyNumber: 1, deletedAt: 1 },
  { unique: true, partialFilterExpression: { policyNumber: { $type: "string" } } },
);
insuranceSchema.index(
  { agentId: 1, legacyVehicleId: 1 },
  { unique: true, partialFilterExpression: { legacyVehicleId: { $type: "string" } } },
);
insuranceSchema.set("toJSON", {
  transform: (_doc, result) => {
    const output = result as unknown as Record<string, unknown>;
    output["id"] = String(output["_id"]);
    delete output["_id"];
    delete output["deletedAt"];
    delete output["legacyVehicleId"];
    return output;
  },
});

export const InsuranceModel = model("Insurance", insuranceSchema);
