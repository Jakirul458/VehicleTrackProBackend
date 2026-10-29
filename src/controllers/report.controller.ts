import type { Request, Response } from "express";
import { VehicleModel } from "../models/Vehicle.js";
import { InsuranceModel } from "../models/Insurance.js";
import { TaxModel } from "../models/Tax.js";
import { PucModel } from "../models/Puc.js";
import { UserModel } from "../models/User.js";
import { Types } from "mongoose";
import { HttpError } from "../utils/http.js";
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

export async function agentFinancialSummary(req: Request, res: Response) {
  const agentId = req.user?.id;
  if (!agentId || !Types.ObjectId.isValid(agentId)) {
    throw new HttpError(401, "Your agent account is unavailable.");
  }
  const [insurance, tax, puc] = await Promise.all([
    InsuranceModel.find({ agentId, deletedAt: null }).select("createdAt paymentDate portalPaid customerPaid commission").lean(),
    TaxModel.find({ agentId, deletedAt: null }).select("createdAt paymentDate amount portalPaid customerPaid paymentStatus").lean(),
    PucModel.find({ agentId, deletedAt: null }).select("createdAt paymentDate portalPaid customerPaid").lean(),
  ]);
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const yearStart = new Date(now.getFullYear(), 0, 1);
  const summarizePeriod = (start?: Date) => {
    const records = [...insurance, ...tax].filter((row) => {
      const accountingDate = row.paymentDate ?? row.createdAt;
      return !start || accountingDate >= start;
    });
    const insuranceRows = insurance.filter((row) => {
      const accountingDate = row.paymentDate ?? row.createdAt;
      return !start || accountingDate >= start;
    });
    const taxRows = tax.filter((row) => {
      const accountingDate = row.paymentDate ?? row.createdAt;
      return !start || accountingDate >= start;
    });
    const pucRows = puc.filter((row) => {
      const accountingDate = row.paymentDate ?? row.createdAt;
      return !start || accountingDate >= start;
    });
    const paidToPortal =
      insuranceRows.reduce((total, row) => total + (row.portalPaid ?? 0), 0) +
      taxRows.reduce(
        (total, row) =>
          total +
          (row.portalPaid ?? (row.paymentStatus === "PAID" ? (row.amount ?? 0) : 0)),
        0,
      ) +
      pucRows.reduce((total, row) => total + (row.portalPaid ?? 0), 0);
    const commissionEarned = insuranceRows.reduce(
      (total, row) => total + (row.commission ?? 0),
      0,
    );
    const collectedFromCustomers =
      records.reduce((total, row) => total + (row.customerPaid ?? 0), 0) +
      pucRows.reduce((total, row) => total + (row.customerPaid ?? 0), 0);

    return {
      paidToPortal,
      commissionEarned,
      collectedFromCustomers,
      profit: collectedFromCustomers + commissionEarned - paidToPortal,
      records: records.length + pucRows.length,
    };
  };

  return sendData(res, {
    monthly: summarizePeriod(monthStart),
    yearly: summarizePeriod(yearStart),
    lifetime: summarizePeriod(),
  });
}

export async function paymentRecords(req: Request, res: Response) {
  const filter: Record<string, unknown> = { deletedAt: null };
  if (req.user?.role !== "SUPER_ADMIN") {
    const agentId = req.user?.id;
    if (!agentId || !Types.ObjectId.isValid(agentId)) {
      throw new HttpError(401, "Your agent account is unavailable.");
    }
    filter["agentId"] = agentId;
  }

  const [insurance, tax, puc] = await Promise.all([
    InsuranceModel.find(filter)
      .select("agentId customerName mobile vehicleNumber paymentDate createdAt premium portalPaid customerPaid commission")
      .lean(),
    TaxModel.find(filter)
      .select("agentId customerName mobile vehicleNumber paymentDate createdAt amount portalPaid customerPaid paymentStatus")
      .lean(),
    PucModel.find(filter)
      .select("agentId customerName mobile vehicleNumber paymentDate createdAt amount portalPaid customerPaid")
      .lean(),
  ]);
  const agents = await UserModel.find(req.user?.role === "SUPER_ADMIN" ? { role: "AGENT" } : { _id: req.user?.id })
    .select("fullName businessName")
    .lean();
  const agentNames = new Map(
    agents.map((agent) => [String(agent._id), agent.businessName || agent.fullName]),
  );

  const toRecord = (
    row: {
      _id: Types.ObjectId;
      agentId: Types.ObjectId;
      customerName?: string | null;
      mobile?: string | null;
      vehicleNumber?: string | null;
      paymentDate?: Date;
      createdAt: Date;
      premium?: number | null;
      amount?: number | null;
      portalPaid?: number | null;
      customerPaid?: number | null;
      commission?: number | null;
      paymentStatus?: string;
    },
    type: "Insurance" | "Tax" | "PUC",
  ) => {
    const customerPaid = row.customerPaid ?? 0;
    const portalPaid =
      row.portalPaid ?? (type === "Tax" && row.paymentStatus === "PAID" ? (row.amount ?? 0) : 0);
    const commission = row.commission ?? 0;

    return {
      id: String(row._id),
      agentId: String(row.agentId),
      agentName: agentNames.get(String(row.agentId)) ?? "",
      type,
      customerName: row.customerName ?? undefined,
      mobile: row.mobile ?? undefined,
      vehicleNumber: row.vehicleNumber ?? undefined,
      paymentDate: (row.paymentDate ?? row.createdAt).toISOString(),
      documentAmount: row.premium ?? row.amount ?? 0,
      customerPaid,
      portalPaid,
      commission,
      profit: customerPaid + (type === "Insurance" ? commission : 0) - portalPaid,
    };
  };

  const records = [
    ...insurance.map((row) => toRecord(row, "Insurance")),
    ...tax.map((row) => toRecord(row, "Tax")),
    ...puc.map((row) => toRecord(row, "PUC")),
  ].sort((a, b) => Date.parse(b.paymentDate) - Date.parse(a.paymentDate));

  return sendData(
    res,
    req.user?.role === "SUPER_ADMIN"
      ? {
          records,
          agents: agents.map((agent) => ({
            id: String(agent._id),
            name: agent.businessName || agent.fullName,
          })),
        }
      : { records, agents: [] },
  );
}
