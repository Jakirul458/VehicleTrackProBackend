import type { Request, Response } from "express";
import { VehicleModel } from "../models/Vehicle.js";
import { InsuranceModel } from "../models/Insurance.js";
import { TaxModel } from "../models/Tax.js";
import { PucModel } from "../models/Puc.js";
import { UserModel } from "../models/User.js";
import { sendData } from "../utils/http.js";

async function summarize(agentId?: string) {
  const filter: Record<string, unknown> = { deletedAt: null };
  const userFilter: Record<string, unknown> = { role: "AGENT" };
  if (agentId) {
    filter["agentId"] = agentId;
    userFilter["_id"] = agentId;
  }

  const [totalVehicles, totalAgents, activeAgents, suspendedAgents, insurance, tax, puc] = await Promise.all([
    VehicleModel.countDocuments(filter),
    UserModel.countDocuments(userFilter),
    UserModel.countDocuments({ ...userFilter, status: "ACTIVE" }),
    UserModel.countDocuments({ ...userFilter, status: "SUSPENDED" }),
    InsuranceModel.find(filter).select("expiryDate").lean(),
    TaxModel.find(filter).select("expiryDate").lean(),
    PucModel.find(filter).select("expiryDate").lean(),
  ]);

  const today = new Date();
  const todayUtc = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  const countStatuses = (records: { expiryDate?: Date | null | undefined }[]) => {
    const counts = { active: 0, due: 0, soon: 0, urgent: 0, expired: 0 };
    for (const record of records) {
      if (!record.expiryDate) continue;
      const expiry = new Date(record.expiryDate);
      const expiryUtc = Date.UTC(expiry.getFullYear(), expiry.getMonth(), expiry.getDate());
      const daysLeft = Math.round((expiryUtc - todayUtc) / 86_400_000);
      if (daysLeft <= 0) counts.expired++;
      else if (daysLeft <= 7) counts.urgent++;
      else if (daysLeft <= 30) counts.soon++;
      else if (daysLeft <= 60) counts.due++;
      else counts.active++;
    }
    return counts;
  };
  const insuranceCounts = countStatuses(insurance);
  const taxCounts = countStatuses(tax);
  const pucCounts = countStatuses(puc);

  return {
    totalVehicles,
    totalAgents,
    activeAgents,
    suspendedAgents,
    activeInsurance: insuranceCounts.active,
    insuranceDue: insuranceCounts.due,
    insuranceSoon: insuranceCounts.soon,
    insuranceUrgent: insuranceCounts.urgent,
    insuranceExpiringSoon: insuranceCounts.soon + insuranceCounts.urgent,
    expiredInsurance: insuranceCounts.expired,
    activeTax: taxCounts.active,
    taxDue: taxCounts.due,
    taxSoon: taxCounts.soon,
    taxUrgent: taxCounts.urgent,
    taxExpiringSoon: taxCounts.soon + taxCounts.urgent,
    expiredTax: taxCounts.expired,
    activePuc: pucCounts.active,
    pucDue: pucCounts.due,
    pucSoon: pucCounts.soon,
    pucUrgent: pucCounts.urgent,
    pucExpiringSoon: pucCounts.soon + pucCounts.urgent,
    expiredPuc: pucCounts.expired,
  };
}

export async function agentDashboard(req: Request, res: Response) {
  return sendData(res, await summarize(req.user?.id));
}

export async function adminDashboard(_req: Request, res: Response) {
  return sendData(res, await summarize());
}
