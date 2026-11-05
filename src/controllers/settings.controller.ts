import type { Request, Response } from "express";
import { z } from "zod";
import { PlatformSettingsModel } from "../models/PlatformSettings.js";
import { sendData } from "../utils/http.js";

const settingsSchema = z
  .object({
    supportWhatsapp: z.string().trim().max(20),
    supportEmail: z.union([z.string().trim().email().max(254), z.literal("")]),
    businessName: z
      .string()
      .trim()
      .max(160)
      .optional()
      .default("VehicleTrack Pro"),
    businessAddress: z.string().trim().max(500).optional().default(""),
    businessGstin: z.string().trim().max(20).optional().default(""),
    invoiceGstEnabled: z.boolean().default(false),
    invoiceGstRate: z.number().min(0).max(100).default(18),
    invoiceAuthorizedSignatory: z.string().trim().max(120).default(""),
    invoiceSignatureImage: z
      .union([
        z
          .string()
          .max(350_000)
          .regex(/^data:image\/(?:png|jpeg);base64,[A-Za-z0-9+/=]+$/),
        z.literal(""),
      ])
      .default(""),
    qrCodeUrl: z.union([
      z.string().trim().url().max(2048),
      z
        .string()
        .max(700_000)
        .regex(/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/),
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
  })
  .superRefine((settings, context) => {
    if (
      settings.invoiceGstEnabled &&
      !/^[0-9A-Z]{15}$/.test(settings.businessGstin.trim().toUpperCase())
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["businessGstin"],
        message:
          "A valid 15-character GSTIN is required when GST is enabled by default.",
      });
    }
  });

async function getPlatformSettings() {
  const settings = await PlatformSettingsModel.findOneAndUpdate(
    { key: "platform" },
    { $setOnInsert: { key: "platform" } },
    { new: true, upsert: true, setDefaultsOnInsert: true },
  );
  return settings;
}

export async function getPublicSettings(req: Request, res: Response) {
  const settings = await getPlatformSettings();
  if (req.user?.role === "SUPER_ADMIN") return sendData(res, settings);
  const publicSettings = settings.toObject();
  publicSettings.invoiceSignatureImage = "";
  return sendData(res, publicSettings);
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
