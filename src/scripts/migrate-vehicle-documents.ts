import mongoose from "mongoose";
import { connectDatabase } from "../config/database.js";
import { CustomerModel } from "../models/Customer.js";
import { InsuranceModel } from "../models/Insurance.js";
import { PucModel } from "../models/Puc.js";
import { TaxModel } from "../models/Tax.js";
import { VehicleModel } from "../models/Vehicle.js";

async function migrateVehicleDocuments() {
  mongoose.set("autoIndex", false);
  await connectDatabase();

  const insuranceCollectionExists = await InsuranceModel.db.db
    ?.listCollections({ name: InsuranceModel.collection.name }, { nameOnly: true })
    .hasNext();
  if (!insuranceCollectionExists) await InsuranceModel.createCollection();

  const existingIndexes = await InsuranceModel.collection.indexes();
  const oldUniquePolicyIndex = existingIndexes.find(
    (index) => index.name === "agentId_1_policyNumber_1_deletedAt_1" && !index.partialFilterExpression,
  );
  if (oldUniquePolicyIndex?.name) {
    await InsuranceModel.collection.dropIndex(oldUniquePolicyIndex.name);
  }
  await Promise.all([
    InsuranceModel.createIndexes(),
    TaxModel.createIndexes(),
    PucModel.createIndexes(),
  ]);

  let insuranceCount = 0;
  let taxCount = 0;
  let pucCount = 0;
  const customerCache = new Map<
    string,
    Promise<{
      fullName?: string | null | undefined;
      phone?: string | null | undefined;
      address?: string | null | undefined;
    } | null>
  >();

  const vehicles = VehicleModel.find({ deletedAt: null })
    .select("agentId customerId registrationNumber chassisNumber engineNumber ownerName documents")
    .lean()
    .cursor();

  for await (const vehicle of vehicles) {
    const customerId = vehicle.customerId ? String(vehicle.customerId) : "";
    if (customerId && !customerCache.has(customerId)) {
      customerCache.set(
        customerId,
        CustomerModel.findById(customerId)
          .select("fullName phone address")
          .lean()
          .exec()
          .then((record) => record ? {
            fullName: record.fullName,
            phone: record.phone,
            address: record.address,
          } : null),
      );
    }
    const customer = customerId ? await customerCache.get(customerId) : null;
    const documents = vehicle.documents;
    const common = {
      agentId: vehicle.agentId,
      customerId: vehicle.customerId,
      customerName: vehicle.ownerName || customer?.fullName,
      vehicleNumber: vehicle.registrationNumber,
      chassisNumber: vehicle.chassisNumber,
      engineNumber: vehicle.engineNumber,
      address: customer?.address,
      legacyVehicleId: String(vehicle._id),
    };

    const hasInsurance = Boolean(
      documents.insuranceProvider ||
      documents.insurancePolicyNumber ||
      documents.insuranceStartDate ||
      documents.insuranceExpiryDate ||
      documents.insuranceMobileNo ||
      documents.insurancePremium ||
      documents.insurancePayToPortal ||
      documents.insuranceCustomerPaid ||
      documents.insuranceCommission,
    );
    if (hasInsurance) {
      const result = await InsuranceModel.updateOne(
        { agentId: vehicle.agentId, legacyVehicleId: String(vehicle._id) },
        {
          $setOnInsert: {
            ...common,
            mobile: documents.insuranceMobileNo || customer?.phone,
            policyNumber: documents.insurancePolicyNumber,
            insuranceCompany: documents.insuranceProvider,
            premium: documents.insurancePremium,
            portalPaid: documents.insurancePayToPortal,
            customerPaid: documents.insuranceCustomerPaid,
            commission: documents.insuranceCommission,
            startDate: documents.insuranceStartDate,
            expiryDate: documents.insuranceExpiryDate,
          },
        },
        { upsert: true },
      );
      if (result.upsertedCount) insuranceCount++;
    }

    const hasTax = Boolean(
      documents.roadTaxStartDate ||
      documents.roadTaxExpiryDate ||
      documents.roadTaxAmount ||
      documents.roadTaxCustomerPaid ||
      documents.roadTaxProfit,
    );
    if (hasTax) {
      const result = await TaxModel.updateOne(
        { agentId: vehicle.agentId, legacyVehicleId: String(vehicle._id) },
        {
          $setOnInsert: {
            ...common,
            mobile: customer?.phone,
            amount: documents.roadTaxAmount,
            customerPaid: documents.roadTaxCustomerPaid,
            startDate: documents.roadTaxStartDate,
            expiryDate: documents.roadTaxExpiryDate,
          },
        },
        { upsert: true },
      );
      if (result.upsertedCount) taxCount++;
    }

    const hasPuc = Boolean(documents.pucNumber || documents.pucStartDate || documents.pucExpiryDate);
    if (hasPuc) {
      const result = await PucModel.updateOne(
        { agentId: vehicle.agentId, legacyVehicleId: String(vehicle._id) },
        {
          $setOnInsert: {
            ...common,
            mobile: customer?.phone,
            startDate: documents.pucStartDate,
            expiryDate: documents.pucExpiryDate,
          },
        },
        { upsert: true },
      );
      if (result.upsertedCount) pucCount++;
    }
  }

  console.info(`Migrated embedded vehicle records: ${insuranceCount} insurance, ${taxCount} tax, ${pucCount} PUC.`);
}

migrateVehicleDocuments()
  .catch((error: unknown) => {
    console.error("Could not migrate embedded vehicle documents.", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
