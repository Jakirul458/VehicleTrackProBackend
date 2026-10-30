import type { Request, Response } from "express";
import { Types, type PipelineStage } from "mongoose";
import { env } from "../config/env.js";
import { InsuranceModel } from "../models/Insurance.js";
import { PucModel } from "../models/Puc.js";
import { TaxModel } from "../models/Tax.js";
import { HttpError, sendData } from "../utils/http.js";

type ReminderType = "insurance" | "tax" | "puc";

interface ReminderDocument {
  _id: Types.ObjectId;
  customerName?: string;
  mobile?: string;
  vehicleNumber?: string;
  expiryDate: Date;
}

interface ReminderItem {
  id: string;
  type: ReminderType;
  customerName?: string;
  mobile?: string;
  vehicleNumber?: string;
  expiryDate: string;
  daysLeft: number;
}

function latestPerVehiclePipeline(
  agentId: Types.ObjectId,
  cutoff: Date,
): PipelineStage[] {
  return [
    {
      $match: {
        agentId,
        deletedAt: null,
        expiryDate: { $type: "date" },
      },
    },
    { $sort: { expiryDate: -1, _id: -1 } },
    {
      $group: {
        _id: {
          $cond: [
            {
              $and: [
                { $ne: [{ $ifNull: ["$mobile", ""] }, ""] },
                { $ne: [{ $ifNull: ["$vehicleNumber", ""] }, ""] },
              ],
            },
            { $concat: ["$mobile", "|", "$vehicleNumber"] },
            { $toString: "$_id" },
          ],
        },
        record: { $first: "$$ROOT" },
      },
    },
    { $replaceRoot: { newRoot: "$record" } },
    { $match: { expiryDate: { $lte: cutoff } } },
    {
      $project: {
        _id: 1,
        customerName: 1,
        mobile: 1,
        vehicleNumber: 1,
        expiryDate: 1,
      },
    },
  ];
}

function toReminderItems(
  records: ReminderDocument[],
  type: ReminderType,
  todayUtc: number,
): ReminderItem[] {
  return records.map((record) => ({
    id: String(record._id),
    type,
    ...(record.customerName ? { customerName: record.customerName } : {}),
    ...(record.mobile ? { mobile: record.mobile } : {}),
    ...(record.vehicleNumber ? { vehicleNumber: record.vehicleNumber } : {}),
    expiryDate: record.expiryDate.toISOString(),
    daysLeft: Math.round(
      (Date.UTC(
        record.expiryDate.getUTCFullYear(),
        record.expiryDate.getUTCMonth(),
        record.expiryDate.getUTCDate(),
      ) -
        todayUtc) /
        86_400_000,
    ),
  }));
}

export async function listReminders(req: Request, res: Response) {
  if (req.user?.role !== "AGENT" || !Types.ObjectId.isValid(req.user.id)) {
    throw new HttpError(403, "Only agents can view their customer reminders.");
  }

  const now = new Date();
  const todayUtc = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
  );
  const cutoff = new Date(
    todayUtc + (env.DEFAULT_EXPIRY_WARNING_DAYS + 1) * 86_400_000 - 1,
  );
  const agentId = new Types.ObjectId(req.user.id);
  const pipeline = latestPerVehiclePipeline(agentId, cutoff);

  const moduleAccess = req.user.moduleAccess;
  const [insurance, tax, puc] = await Promise.all([
    moduleAccess.insurance
      ? InsuranceModel.aggregate<ReminderDocument>(pipeline)
      : Promise.resolve([]),
    moduleAccess.tax ? TaxModel.aggregate<ReminderDocument>(pipeline) : Promise.resolve([]),
    moduleAccess.puc ? PucModel.aggregate<ReminderDocument>(pipeline) : Promise.resolve([]),
  ]);

  const items = [
    ...toReminderItems(insurance, "insurance", todayUtc),
    ...toReminderItems(tax, "tax", todayUtc),
    ...toReminderItems(puc, "puc", todayUtc),
  ].sort((left, right) => left.daysLeft - right.daysLeft);

  return sendData(res, { warningDays: env.DEFAULT_EXPIRY_WARNING_DAYS, items });
}
