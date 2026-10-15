import { randomUUID } from "node:crypto";
import type { Request, Response } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { CustomerModel } from "../models/Customer.js";
import { UserModel } from "../models/User.js";
import { HttpError, publicUser, sendData } from "../utils/http.js";

const createSchema = z.object({
  fullName: z.string().trim().min(2).max(120),
  businessName: z.string().trim().min(2).max(160),
  mobile: z.string().trim().regex(/^\+?[0-9]{10,15}$/),
  email: z.string().trim().email().max(254),
  password: z.string().min(12).max(200),
  plan: z.enum(["TRIAL", "BASIC", "PRO"]).default("BASIC"),
});
const updateSchema = z.object({
  fullName: z.string().trim().min(2).max(120).optional(),
  businessName: z.string().trim().min(2).max(160).optional(),
  mobile: z.string().trim().regex(/^\+?[0-9]{10,15}$/).optional(),
  email: z.string().trim().email().max(254).optional(),
  plan: z.enum(["TRIAL", "BASIC", "PRO"]).optional(),
});
const statusSchema = z.object({ status: z.enum(["ACTIVE", "SUSPENDED"]) });
const passwordSchema = z.object({ password: z.string().min(12).max(200) });
const extendValiditySchema = z.object({
  days: z.number().int().min(1).max(365),
  plan: z.enum(["TRIAL", "BASIC", "PRO"]).optional(),
});

async function toAgent(user: { toObject: () => Record<string, unknown> }) {
  const raw = user.toObject();
  const id = String(raw["_id"]);
  const customerCount = await CustomerModel.countDocuments({ agentId: id, deletedAt: null });
  return { ...publicUser(raw), customerCount };
}

export async function listAgents(_req: Request, res: Response) {
  const agents = await UserModel.find({ role: "AGENT" }).sort({ createdAt: -1 });
  return sendData(res, await Promise.all(agents.map(toAgent)));
}

export async function createAgent(req: Request, res: Response) {
  const input = createSchema.parse(req.body);
  const user = await UserModel.create({
    ...input,
    email: input.email.toLowerCase(),
    passwordHash: await bcrypt.hash(input.password, 12),
    role: "AGENT",
    agentCode: `AGN-${randomUUID().slice(0, 8).toUpperCase()}`,
    status: "ACTIVE",
  });
  return sendData(res, await toAgent(user), 201);
}

export async function updateAgent(req: Request, res: Response) {
  const input = updateSchema.parse(req.body);
  if (input.email) input.email = input.email.toLowerCase();
  const user = await UserModel.findOneAndUpdate(
    { _id: req.params["id"], role: "AGENT" },
    input,
    { new: true, runValidators: true },
  );
  if (!user) throw new HttpError(404, "Agent not found.");
  return sendData(res, await toAgent(user));
}

export async function updateAgentStatus(req: Request, res: Response) {
  const { status } = statusSchema.parse(req.body);
  const user = await UserModel.findOneAndUpdate(
    { _id: req.params["id"], role: "AGENT" },
    { status },
    { new: true, runValidators: true },
  );
  if (!user) throw new HttpError(404, "Agent not found.");
  return sendData(res, await toAgent(user));
}

export async function updateAgentPassword(req: Request, res: Response) {
  const { password } = passwordSchema.parse(req.body);
  const user = await UserModel.findOneAndUpdate(
    { _id: req.params["id"], role: "AGENT" },
    { passwordHash: await bcrypt.hash(password, 12) },
    { new: true },
  );
  if (!user) throw new HttpError(404, "Agent not found.");
  return sendData(res, { id: String(user._id), updated: true });
}

export async function extendAgentValidity(req: Request, res: Response) {
  const { days, plan } = extendValiditySchema.parse(req.body);
  const user = await UserModel.findOne({ _id: req.params["id"], role: "AGENT" });
  if (!user) throw new HttpError(404, "Agent not found.");

  const currentEndDate = user.trialEndDate ? new Date(user.trialEndDate) : new Date();
  const newEndDate = new Date(currentEndDate);
  newEndDate.setDate(newEndDate.getDate() + days);

  const updateData: Record<string, unknown> = { trialEndDate: newEndDate };
  if (plan) updateData.plan = plan;

  const updatedUser = await UserModel.findOneAndUpdate(
    { _id: req.params["id"], role: "AGENT" },
    updateData,
    { new: true, runValidators: true },
  );
  if (!updatedUser) throw new HttpError(404, "Agent not found.");

  return sendData(res, await toAgent(updatedUser));
}
