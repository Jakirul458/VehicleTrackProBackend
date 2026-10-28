import { Schema, model } from "mongoose";

const taxSchema = new Schema(
  {
    agentId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    customerId: { type: Schema.Types.ObjectId, ref: "Customer" },
    legacyVehicleId: { type: String, select: false },
    customerName: { type: String, trim: true, maxlength: 120 },
    mobile: { type: String, trim: true, maxlength: 20 },
    vehicleNumber: { type: String, trim: true, uppercase: true, maxlength: 24 },
    chassisNumber: { type: String, trim: true, uppercase: true, maxlength: 64 },
    engineNumber: { type: String, trim: true, uppercase: true, maxlength: 64 },
    taxType: { type: String, enum: ["Road Tax", "Green Tax", "Professional Tax"] },
    taxPeriod: { type: String, enum: ["Quarterly", "Half-yearly", "Yearly", "Lifetime"] },
    amount: { type: Number, min: 0, default: 0 },
    portalPaid: { type: Number, min: 0 },
    customerPaid: { type: Number, min: 0 },
    paymentStatus: { type: String, enum: ["PAID", "PENDING"], default: "PENDING" },
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

taxSchema.index({ agentId: 1, vehicleNumber: 1, deletedAt: 1 });
taxSchema.index(
  { agentId: 1, legacyVehicleId: 1 },
  { unique: true, partialFilterExpression: { legacyVehicleId: { $type: "string" } } },
);
taxSchema.set("toJSON", {
  transform: (_doc, result) => {
    const output = result as unknown as Record<string, unknown>;
    output["id"] = String(output["_id"]);
    delete output["_id"];
    delete output["deletedAt"];
    delete output["legacyVehicleId"];
    return output;
  },
});

export const TaxModel = model("Tax", taxSchema);
