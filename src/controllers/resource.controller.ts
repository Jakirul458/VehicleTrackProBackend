import type { Request, Response } from "express";
import { Types, type Model } from "mongoose";
import { z } from "zod";
import { CustomerModel } from "../models/Customer.js";
import { InsuranceModel } from "../models/Insurance.js";
import { PucModel } from "../models/Puc.js";
import { TaxModel } from "../models/Tax.js";
import { HttpError, sendData } from "../utils/http.js";

const customerSchema = z.object({
  name: z.string().trim().min(2).max(120),
  mobile: z.string().trim().min(10).max(20),
  altMobile: z.string().trim().max(20).optional(),
  address: z.string().trim().max(500).optional(),
  agentId: z.string().optional(),
});
const insuranceSchema = z.object({
  customerId: z.string().optional(),
  customerName: z.string().trim().max(120).optional(),
  mobile: z.string().trim().max(20).optional(),
  vehicleNumber: z.string().trim().max(24).optional(),
  chassisNumber: z.string().trim().max(64).optional(),
  engineNumber: z.string().trim().max(64).optional(),
  policyNumber: z.preprocess(
    (value) => typeof value === "string" && value.trim() === "" ? undefined : value,
    z.string().trim().max(80).optional(),
  ),
  insuranceCompany: z.string().trim().max(120).optional(),
  policyType: z.enum(["Comprehensive", "Third Party", "Own Damage"]).optional(),
  premium: z.coerce.number().min(0).optional(),
  portalPaid: z.coerce.number().min(0).optional(),
  customerPaid: z.coerce.number().min(0).optional(),
  commission: z.coerce.number().min(0).optional(),
  startDate: z.coerce.date().optional(),
  expiryDate: z.coerce.date().optional(),
  address: z.string().trim().max(500).optional(),
  remarks: z.string().max(1000).optional(),
  agentId: z.string().optional(),
});
const taxSchema = z.object({
  customerId: z.string().optional(),
  customerName: z.string().trim().max(120).optional(),
  mobile: z.string().trim().max(20).optional(),
  vehicleNumber: z.string().trim().max(24).optional(),
  chassisNumber: z.string().trim().max(64).optional(),
  engineNumber: z.string().trim().max(64).optional(),
  taxType: z.enum(["Road Tax", "Green Tax", "Professional Tax"]).optional(),
  taxPeriod: z.enum(["Quarterly", "Half-yearly", "Yearly", "Lifetime"]).optional(),
  amount: z.coerce.number().min(0).optional(),
  customerPaid: z.coerce.number().min(0).optional(),
  paymentStatus: z.enum(["PAID", "PENDING"]).default("PENDING"),
  startDate: z.coerce.date().optional(),
  expiryDate: z.coerce.date().optional(),
  address: z.string().trim().max(500).optional(),
  remarks: z.string().max(1000).optional(),
  agentId: z.string().optional(),
});
const pucSchema = z.object({
  customerId: z.string().optional(),
  customerName: z.string().trim().max(120).optional(),
  mobile: z.string().trim().max(20).optional(),
  vehicleNumber: z.string().trim().max(24).optional(),
  chassisNumber: z.string().trim().max(64).optional(),
  engineNumber: z.string().trim().max(64).optional(),
  startDate: z.coerce.date().optional(),
  expiryDate: z.coerce.date().optional(),
  address: z.string().trim().max(500).optional(),
  remarks: z.string().max(1000).optional(),
  agentId: z.string().optional(),
});

type Resource = "customers" | "insurance" | "tax" | "puc";
const definitions: Record<Resource, { model: Model<any>; schema: z.ZodObject<any>; searchable: string[] }> = {
  customers: { model: CustomerModel, schema: customerSchema, searchable: ["name", "mobile", "address"] },
  insurance: { model: InsuranceModel, schema: insuranceSchema, searchable: ["customerName", "mobile", "vehicleNumber", "policyNumber", "insuranceCompany"] },
  tax: { model: TaxModel, schema: taxSchema, searchable: ["customerName", "mobile", "vehicleNumber", "taxType"] },
  puc: { model: PucModel, schema: pucSchema, searchable: ["customerName", "mobile", "vehicleNumber", "chassisNumber", "engineNumber"] },
};

function resolveResource(req: Request) {
  const key = req.params["resource"] as Resource;
  const definition = definitions[key];
  if (!definition) throw new HttpError(404, "Resource not found.");
  return { key, ...definition };
}

function ownerFilter(req: Request, resource: Resource) {
  const filter: Record<string, unknown> = { deletedAt: null };
  if (req.user?.role !== "SUPER_ADMIN") filter["agentId"] = req.user?.id;
  else if (resource === "customers" || resource === "insurance" || resource === "tax") {
    const requestedAgent = req.query["agentId"] ?? req.body?.agentId;
    if (typeof requestedAgent === "string" && requestedAgent) filter["agentId"] = requestedAgent;
  }
  return filter;
}

function parseBody(schema: z.ZodObject<any>, body: unknown, partial = false) {
  return (partial ? schema.partial() : schema).parse(body) as Record<string, unknown>;
}

function requireAgentWriteAccess(req: Request) {
  if (req.user?.role !== "AGENT") {
    throw new HttpError(403, "Only agents can create or change document records.");
  }
}

export async function listResource(req: Request, res: Response) {
  const { key, model, searchable } = resolveResource(req);
  const filter = ownerFilter(req, key);
  const customerId = req.query["customerId"];
  if (typeof customerId === "string" && Types.ObjectId.isValid(customerId)) filter["customerId"] = customerId;
  const search = req.query["search"];
  if (typeof search === "string" && search.trim()) {
    const expression = new RegExp(search.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    filter["$or"] = searchable.map((field) => ({ [field]: expression }));
  }
  const rows = await model.find(filter).sort({ createdAt: -1 }).limit(500);
  return sendData(res, rows);
}

export async function createResource(req: Request, res: Response) {
  requireAgentWriteAccess(req);
  const { key, model, schema } = resolveResource(req);
  const body = parseBody(schema, req.body);
  const agentId = req.user?.id;
  if (typeof agentId !== "string" || !Types.ObjectId.isValid(agentId)) {
    throw new HttpError(401, "Your agent account is unavailable.");
  }
  if (key !== "customers" && typeof body["customerId"] === "string") {
    const customer = await CustomerModel.findOne({ _id: body["customerId"], agentId, deletedAt: null });
    if (!customer) throw new HttpError(400, "The selected customer does not belong to this agent.");
  }
  const row = await model.create({ ...body, agentId });
  return sendData(res, row, 201);
}

export async function getResource(req: Request, res: Response) {
  const { key, model } = resolveResource(req);
  const row = await model.findOne({ _id: req.params["id"], ...ownerFilter(req, key) });
  if (!row) throw new HttpError(404, "Record not found.");
  return sendData(res, row);
}

export async function updateResource(req: Request, res: Response) {
  requireAgentWriteAccess(req);
  const { key, model, schema } = resolveResource(req);
  const body = parseBody(schema, req.body, true);
  delete body["agentId"];
  if (body["expiryDate"] !== undefined) body["reminderDoneAt"] = null;
  const row = await model.findOneAndUpdate(
    { _id: req.params["id"], ...ownerFilter(req, key) },
    body,
    { new: true, runValidators: true },
  );
  if (!row) throw new HttpError(404, "Record not found.");
  return sendData(res, row);
}

export async function markResourceReminderDone(req: Request, res: Response) {
  requireAgentWriteAccess(req);
  const { key, model } = resolveResource(req);
  if (key === "customers") throw new HttpError(404, "Reminder record not found.");
  const row = await model.findOneAndUpdate(
    { _id: req.params["id"], ...ownerFilter(req, key) },
    { reminderDoneAt: new Date() },
    { new: true, runValidators: true },
  );
  if (!row) throw new HttpError(404, "Reminder record not found.");
  return sendData(res, row);
}

export async function deleteResource(req: Request, res: Response) {
  requireAgentWriteAccess(req);
  const { key, model } = resolveResource(req);
  const row = await model.findOneAndUpdate(
    { _id: req.params["id"], ...ownerFilter(req, key) },
    { deletedAt: new Date() },
    { new: true },
  );
  if (!row) throw new HttpError(404, "Record not found.");
  return sendData(res, { id: String(row._id) });
}

export async function restoreResource(req: Request, res: Response) {
  requireAgentWriteAccess(req);
  const { key, model } = resolveResource(req);
  const row = await model.findOneAndUpdate(
    { _id: req.params["id"], agentId: req.query["agentId"], deletedAt: { $ne: null } },
    { deletedAt: null },
    { new: true },
  );
  if (!row) throw new HttpError(404, "Deleted record not found.");
  return sendData(res, row);
}

export async function listCustomers(req: Request, res: Response) {
  const filter = ownerFilter(req, "customers");
  const search = req.query["search"];
  if (typeof search === "string" && search.trim()) {
    const expression = new RegExp(search.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    filter["$or"] = [{ name: expression }, { mobile: expression }, { address: expression }];
  }
  const customers = await CustomerModel.find(filter).sort({ createdAt: -1 }).limit(500);
  const rows = await Promise.all(customers.map(async (customer) => {
    const agentId = String(customer.agentId);
    const customerId = String(customer._id);
    const [insurance, tax] = await Promise.all([
      InsuranceModel.find({ customerId, agentId, deletedAt: null }).select("expiryDate").lean(),
      TaxModel.find({ customerId, agentId, deletedAt: null }).select("expiryDate").lean(),
    ]);
    const expiries = [...insurance, ...tax].flatMap((doc) =>
      doc.expiryDate ? [new Date(doc.expiryDate).getTime()] : [],
    );
    const now = Date.now();
    const dueSoon = expiries.filter((date) => date >= now && date <= now + 30 * 86400000).length;
    const expired = expiries.filter((date) => date < now).length;
    return {
      ...customer.toJSON(),
      agentId,
      vehicleCount: 0,
      activeDocuments: expiries.length - dueSoon - expired,
      dueSoon,
      expired,
    };
  }));
  return sendData(res, rows);
}
