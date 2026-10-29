import type { Request, Response } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { UserModel } from "../models/User.js";
import { ActivityLogModel } from "../models/ActivityLog.js";
import { HttpError, sendData } from "../utils/http.js";

const createAgentSchema = z.object({
  fullName: z.string().trim().min(2).max(120),
  businessName: z.string().trim().min(2).max(160),
  email: z.string().trim().email().max(254),
  phone: z.string().trim().min(10).max(15),
  password: z.string().min(6).max(200),
  address: z.string().trim().max(500).optional(),
  city: z.string().trim().optional(),
  state: z.string().trim().optional(),
  pinCode: z.string().trim().optional(),
  status: z.enum(["ACTIVE", "SUSPENDED"]),
});

const updateAgentSchema = z.object({
  fullName: z.string().trim().min(2).max(120).optional(),
  businessName: z.string().trim().min(2).max(160).optional(),
  email: z.string().trim().email().max(254).optional(),
  phone: z.string().trim().min(10).max(15).optional(),
  address: z.string().trim().max(500).optional(),
  city: z.string().trim().optional(),
  state: z.string().trim().optional(),
  pinCode: z.string().trim().optional(),
  status: z.enum(["ACTIVE", "SUSPENDED"]).optional(),
});

const updateStatusSchema = z.object({
  status: z.enum(["ACTIVE", "SUSPENDED"]),
});

const updateValiditySchema = z.object({
  trialEndDate: z.string().date(),
});
const resetAgentPasswordSchema = z.object({
  newPassword: z.string().min(6).max(200),
});

async function logActivity(actorId: string, actorRole: string, action: string, entity: string, entityId: string, metadata: Record<string, unknown> = {}) {
  await ActivityLogModel.create({
    actorId,
    actorRole,
    action,
    entity,
    entityId,
    metadata,
  });
}

export async function listAgents(req: Request, res: Response) {
  const page = Math.max(1, Number(req.query["page"]) || 1);
  const limit = Math.min(20, Math.max(10, Number(req.query["limit"]) || 10));
  const skip = (page - 1) * limit;
  const { search, status } = req.query;

  const filter: Record<string, unknown> = { role: "AGENT" };
  if (status) filter.status = status;
  if (search) {
    filter.$or = [
      { fullName: { $regex: search, $options: "i" } },
      { email: { $regex: search, $options: "i" } },
      { mobile: { $regex: search, $options: "i" } },
      { businessName: { $regex: search, $options: "i" } },
    ];
  }

  const [agents, total] = await Promise.all([
    UserModel.find(filter).skip(skip).limit(limit).sort({ createdAt: -1, _id: -1 }),
    UserModel.countDocuments(filter),
  ]);

  return sendData(res, {
    data: agents,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  });
}

export async function getAgent(req: Request, res: Response) {
  const { id } = req.params;
  const agent = await UserModel.findOne({ _id: id, role: "AGENT" });
  if (!agent) throw new HttpError(404, "Agent not found");
  return sendData(res, agent);
}

export async function createAgent(req: Request, res: Response) {
  const input = createAgentSchema.parse(req.body);
  
  const existingEmail = await UserModel.findOne({ email: input.email.toLowerCase() });
  if (existingEmail) throw new HttpError(409, "Email already exists");

  const existingMobile = await UserModel.findOne({ mobile: input.phone });
  if (existingMobile) throw new HttpError(409, "Phone already exists");

  const passwordHash = await bcrypt.hash(input.password, 6);
  const agent = await UserModel.create({
    fullName: input.fullName,
    businessName: input.businessName,
    email: input.email.toLowerCase(),
    mobile: input.phone,
    passwordHash,
    address: input.address,
    city: input.city,
    state: input.state,
    pinCode: input.pinCode,
    role: "AGENT",
    status: input.status,
  });

  await logActivity(req.user!.id, req.user!.role, "CREATE", "AGENT", agent.id, { agentName: agent.fullName });

  return sendData(res, agent, 201);
}

export async function updateAgent(req: Request, res: Response) {
  const { id } = req.params;
  const input = updateAgentSchema.parse(req.body);

  const agent = await UserModel.findOne({ _id: id, role: "AGENT" });
  if (!agent) throw new HttpError(404, "Agent not found");

  if (input.email && input.email.toLowerCase() !== agent.email) {
    const existingEmail = await UserModel.findOne({ email: input.email.toLowerCase(), _id: { $ne: id } });
    if (existingEmail) throw new HttpError(409, "Email already exists");
  }

  if (input.phone && input.phone !== agent.mobile) {
    const existingMobile = await UserModel.findOne({ mobile: input.phone, _id: { $ne: id } });
    if (existingMobile) throw new HttpError(409, "Phone already exists");
  }

  Object.assign(agent, {
    ...input,
    email: input.email ? input.email.toLowerCase() : agent.email,
    mobile: input.phone || agent.mobile,
  });

  await agent.save();

  await logActivity(req.user!.id, req.user!.role, "UPDATE", "AGENT", agent.id, { agentName: agent.fullName });

  return sendData(res, agent);
}

export async function updateAgentStatus(req: Request, res: Response) {
  const { id } = req.params;
  const { status } = updateStatusSchema.parse(req.body);

  const agent = await UserModel.findOne({ _id: id, role: "AGENT" });
  if (!agent) throw new HttpError(404, "Agent not found");

  agent.status = status;
  await agent.save();

  await logActivity(req.user!.id, req.user!.role, "UPDATE_STATUS", "AGENT", agent.id, { status, agentName: agent.fullName });

  return sendData(res, agent);
}

export async function updateAgentValidity(req: Request, res: Response) {
  const { id } = req.params;
  const { trialEndDate } = updateValiditySchema.parse(req.body);
  const agent = await UserModel.findOne({ _id: id, role: "AGENT" });
  if (!agent) throw new HttpError(404, "Agent not found");

  agent.trialEndDate = new Date(`${trialEndDate}T23:59:59.999Z`);
  await agent.save();
  await logActivity(req.user!.id, req.user!.role, "UPDATE_VALIDITY", "AGENT", agent.id, { trialEndDate });
  return sendData(res, agent);
}

export async function resetAgentPassword(req: Request, res: Response) {
  const { id } = req.params;
  const { newPassword } = resetAgentPasswordSchema.parse(req.body);
  const agent = await UserModel.findOne({ _id: id, role: "AGENT" });
  if (!agent) throw new HttpError(404, "Agent not found");

  agent.passwordHash = await bcrypt.hash(newPassword, 6);
  await agent.save();
  await logActivity(req.user!.id, req.user!.role, "RESET_PASSWORD", "AGENT", agent.id, {
    agentName: agent.fullName,
  });
  return sendData(res, { success: true });
}

export async function deleteAgent(req: Request, res: Response) {
  const { id } = req.params;
  const agentId = Array.isArray(id) ? id[0] : id;

  const agent = await UserModel.findOne({ _id: agentId, role: "AGENT" });
  if (!agent) throw new HttpError(404, "Agent not found");

  await UserModel.deleteOne({ _id: agentId });

  await logActivity(req.user!.id, req.user!.role, "DELETE", "AGENT", String(agent._id), { agentName: agent.fullName });

  return sendData(res, { success: true });
}

export async function listActivity(req: Request, res: Response) {
  const page = Math.max(1, Number(req.query["page"]) || 1);
  const limit = Math.min(20, Math.max(10, Number(req.query["limit"]) || 10));
  const skip = (page - 1) * limit;

  const filter: Record<string, unknown> = {};
  const { actorId, entity, actorRole } = req.query;
  if (actorId && typeof actorId === "string") filter.actorId = actorId;
  if (entity && typeof entity === 'string') filter.entity = entity;
  if (actorRole === "AGENT" || actorRole === "SUPER_ADMIN") filter.actorRole = actorRole;

  const [activities, total] = await Promise.all([
    ActivityLogModel.find(filter).skip(skip).limit(limit).sort({ createdAt: -1, _id: -1 }).populate("actorId", "fullName email"),
    ActivityLogModel.countDocuments(filter),
  ]);

  return sendData(res, {
    data: activities,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  });
}

export async function getDashboardStats(req: Request, res: Response) {
  const [totalAgents, activeAgents, suspendedAgents] = await Promise.all([
    UserModel.countDocuments({ role: "AGENT" }),
    UserModel.countDocuments({ role: "AGENT", status: "ACTIVE" }),
    UserModel.countDocuments({ role: "AGENT", status: "SUSPENDED" }),
  ]);

  return sendData(res, {
    totalAgents,
    activeAgents,
    suspendedAgents,
  });
}
