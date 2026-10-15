import { Schema, model } from "mongoose";

const vehicleDocumentSchema = new Schema({
  insuranceProvider: { type: String, trim: true },
  insurancePolicyNumber: { type: String, trim: true },
  insuranceStartDate: { type: Date },
  insuranceExpiryDate: { type: Date },
  insuranceMobileNo: { type: String, trim: true },
  insurancePremium: { type: Number, default: 0 },
  insurancePayToPortal: { type: Number, default: 0 },
  insuranceCustomerPaid: { type: Number, default: 0 },
  insuranceCommission: { type: Number, default: 0 },
  roadTaxStartDate: { type: Date },
  roadTaxExpiryDate: { type: Date },
  roadTaxAmount: { type: Number, default: 0 },
  roadTaxCustomerPaid: { type: Number, default: 0 },
  roadTaxProfit: { type: Number, default: 0 },
  pucNumber: { type: String, trim: true },
  pucStartDate: { type: Date },
  pucExpiryDate: { type: Date },
}, { _id: false });

const vehicleSchema = new Schema(
  {
    agentId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    customerId: { type: Schema.Types.ObjectId, ref: "Customer", required: true, index: true },
    registrationNumber: { type: String, required: true, trim: true, uppercase: true, unique: true },
    vehicleType: { 
      type: String, 
      enum: ["CAR", "MOTORCYCLE", "COMMERCIAL", "THREE_WHEELER", "OTHER"],
      required: true 
    },
    vehicleMake: { type: String, required: true, trim: true },
    vehicleModel: { type: String, required: true, trim: true },
    vehicleVariant: { type: String, trim: true },
    manufacturingYear: { type: Number, required: true, min: 1900, max: new Date().getFullYear() + 1 },
    fuelType: { 
      type: String, 
      enum: ["PETROL", "DIESEL", "ELECTRIC", "CNG", "HYBRID", "OTHER"],
      required: true 
    },
    chassisNumber: { type: String, required: true, trim: true, uppercase: true },
    engineNumber: { type: String, required: true, trim: true, uppercase: true },
    ownerName: { type: String, required: true, trim: true },
    documents: { type: vehicleDocumentSchema, default: {} },
    deletedAt: { type: Date, default: null, index: true },
  },
  { timestamps: true, versionKey: false }
);

vehicleSchema.index({ agentId: 1, customerId: 1, deletedAt: 1 });

vehicleSchema.set("toJSON", {
  transform: (_doc, result) => {
    const output = result as unknown as Record<string, unknown>;
    output["id"] = String(output["_id"]);
    delete output["_id"];
    delete output["deletedAt"];
    return output;
  },
});

export const VehicleModel = model("Vehicle", vehicleSchema);
