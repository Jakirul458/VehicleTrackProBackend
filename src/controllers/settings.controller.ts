import type { Request, Response } from "express";
import { z } from "zod";
import { PlatformSettingsModel } from "../models/PlatformSettings.js";
import { sendData } from "../utils/http.js";

const settingsSchema = z.object({
  supportWhatsapp: z.string().trim().max(20),
  supportEmail: z.union([z.string().trim().email().max(254), z.literal("")]),
  qrCodeUrl: z.union([
    z.string().trim().url().max(2048),
    z.string().max(700_000).regex(/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/),
    z.literal(""),
  ]),
  upiId: z.string().trim().max(120),
  bankAccountName: z.string().trim().max(120),
  bankName: z.string().trim().max(120),
  bankAccountNumber: z.string().trim().max(40),
  bankIfsc: z.string().trim().max(20),
  bankBranch: z.string().trim().max(120),
  monthlyPrice: z.number().min(0),
  yearlyPrice: z.number().min(0),
  lifetimePrice: z.number().min(0),
  insuranceOnlyPrice: z.number().min(0),
  roadTaxOnlyPrice: z.number().min(0),
  pucOnlyPrice: z.number().min(0),
  taxPucPrice: z.number().min(0),
  insuranceTaxPrice: z.number().min(0),
  insurancePucPrice: z.number().min(0),
  allModulesPrice: z.number().min(0),
});

async function getPlatformSettings() {
  const settings = await PlatformSettingsModel.findOneAndUpdate(
    { key: "platform" },
    { $setOnInsert: { key: "platform" } },
    { new: true, upsert: true, setDefaultsOnInsert: true },
  );
  return settings;
}

export async function getPublicSettings(_req: Request, res: Response) {
  return sendData(res, await getPlatformSettings());
}

export async function updatePlatformSettings(req: Request, res: Response) {
  const input = settingsSchema.parse(req.body);
  const settings = await PlatformSettingsModel.findOneAndUpdate(
    { key: "platform" },
    { $set: input, $setOnInsert: { key: "platform" } },
    { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true },
  );
  return sendData(res, settings);
}
