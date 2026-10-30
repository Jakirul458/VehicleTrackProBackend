import { Schema, model } from "mongoose";

export type Role = "SUPER_ADMIN" | "AGENT";
export type ModuleAccess = {
  insurance: boolean;
  tax: boolean;
  puc: boolean;
};

export const DEFAULT_MODULE_ACCESS: ModuleAccess = {
  insurance: true,
  tax: true,
  puc: true,
};

const userSchema = new Schema(
  {
    role: { type: String, enum: ["SUPER_ADMIN", "AGENT"], required: true },
    fullName: { type: String, required: true, trim: true, maxlength: 120 },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    mobile: { type: String, required: true, unique: true, trim: true },
    passwordHash: { type: String, required: true, select: false },
    businessName: { type: String, trim: true, maxlength: 160 },
    address: { type: String, trim: true, maxlength: 500 },
    city: { type: String, trim: true },
    state: { type: String, trim: true },
    pinCode: { type: String, trim: true },
    moduleAccess: {
      insurance: { type: Boolean, default: true },
      tax: { type: Boolean, default: true },
      puc: { type: Boolean, default: true },
    },
    status: { type: String, enum: ["ACTIVE", "SUSPENDED"], default: "ACTIVE" },
    trialEndDate: { type: Date },
  },
  { timestamps: true, versionKey: false }
);

userSchema.set("toJSON", {
  transform: (_doc, result) => {
    const output = result as unknown as Record<string, unknown>;
    output["id"] = String(output["_id"]);
    delete output["_id"];
    delete output["passwordHash"];
    return output;
  },
});

export const UserModel = model("User", userSchema);
