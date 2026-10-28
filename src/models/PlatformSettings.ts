import { Schema, model } from "mongoose";

const platformSettingsSchema = new Schema(
  {
    key: { type: String, required: true, unique: true, default: "platform" },
    supportWhatsapp: { type: String, trim: true, default: "6294527072" },
    supportEmail: { type: String, trim: true, lowercase: true, default: "" },
    qrCodeUrl: { type: String, trim: true, default: "" },
    upiId: { type: String, trim: true, default: "" },
    bankAccountName: { type: String, trim: true, default: "" },
    bankName: { type: String, trim: true, default: "" },
    bankAccountNumber: { type: String, trim: true, default: "" },
    bankIfsc: { type: String, trim: true, uppercase: true, default: "" },
    bankBranch: { type: String, trim: true, default: "" },
    monthlyPrice: { type: Number, min: 0, default: 0 },
    yearlyPrice: { type: Number, min: 0, default: 4999 },
    lifetimePrice: { type: Number, min: 0, default: 0 },
  },
  { timestamps: true, versionKey: false },
);

export const PlatformSettingsModel = model("PlatformSettings", platformSettingsSchema);
