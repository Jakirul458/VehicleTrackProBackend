import mongoose from "mongoose";
import { env } from "./env.js";
import { ActivityLogModel } from "../models/ActivityLog.js";
import { AuthSessionModel } from "../models/AuthSession.js";
import { PlatformSettingsModel } from "../models/PlatformSettings.js";
import { SubscriptionPlanModel } from "../models/SubscriptionPlan.js";

export async function connectDatabase() {
  mongoose.set("strictQuery", true);
  await mongoose.connect(env.MONGODB_URI);
  await Promise.all([
    ActivityLogModel.collection.createIndex(
      { createdAt: 1 },
      { expireAfterSeconds: 90 * 24 * 60 * 60 },
    ),
    AuthSessionModel.collection.createIndex(
      { expiresAt: 1 },
      { expireAfterSeconds: 0 },
    ),
  ]);
  await seedSubscriptionPlans();
  console.info("MongoDB connected");
}

async function seedSubscriptionPlans() {
  const settings = await PlatformSettingsModel.findOneAndUpdate(
    { key: "platform" },
    { $setOnInsert: { key: "platform" } },
    { new: true, upsert: true, setDefaultsOnInsert: true },
  ).select("+planCatalogInitialized");
  if (settings.planCatalogInitialized) return;

  const planCount = await SubscriptionPlanModel.countDocuments();
  if (planCount === 0) {
    const defaults = [
      [
        "Insurance Only",
        "Track and manage insurance renewals for your vehicles.",
        settings.insuranceOnlyPrice,
      ],
      [
        "Road Tax Only",
        "Keep road tax records and renewal dates organized.",
        settings.roadTaxOnlyPrice,
      ],
      [
        "PUC Only",
        "Track pollution certificate records and upcoming expiries.",
        settings.pucOnlyPrice,
      ],
      [
        "Tax + PUC",
        "Manage road tax and PUC records in one annual plan.",
        settings.taxPucPrice,
      ],
      [
        "Insurance + Tax",
        "Manage insurance and road tax renewals together.",
        settings.insuranceTaxPrice,
      ],
      [
        "Insurance + PUC",
        "Manage insurance and PUC renewals together.",
        settings.insurancePucPrice,
      ],
      [
        "All 3 Modules",
        "Manage insurance, road tax and PUC from one account.",
        settings.allModulesPrice,
      ],
    ] as const;
    await SubscriptionPlanModel.insertMany(
      defaults.map(([name, description, price]) => ({
        name,
        description,
        original_price: price,
        current_price: price,
        offer_tag: "",
      })),
    );
  }
  await PlatformSettingsModel.updateOne(
    { key: "platform" },
    { $set: { planCatalogInitialized: true } },
  );
}
