import type { Request, Response } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { UserModel } from "../models/User.js";
import { ActivityLogModel, recordActivity } from "../models/ActivityLog.js";
import { AuthSessionModel } from "../models/AuthSession.js";
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

async function logActivity(
  actorId: string,
  actorRole: "SUPER_ADMIN" | "AGENT",
  action: string,
  entity: string,
  entityId: string,
  metadata: Record<string, unknown> = {},
  ipAddress?: string,
) {
  await ActivityLogModel.create({
    actorId,
    actorRole,
    action,
    entity,
    entityId,
    metadata,
    ...(ipAddress ? { ipAddress } : {}),
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
    UserModel.find(filter)
      .skip(skip)
      .limit(limit)
      .sort({ createdAt: -1, _id: -1 }),
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

  const existingEmail = await UserModel.findOne({
    email: input.email.toLowerCase(),
  });
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

  await logActivity(req.user!.id, req.user!.role, "CREATE", "AGENT", agent.id, {
    agentName: agent.fullName,
  });

  return sendData(res, agent, 201);
}

export async function updateAgent(req: Request, res: Response) {
  const { id } = req.params;
  const input = updateAgentSchema.parse(req.body);

  const agent = await UserModel.findOne({ _id: id, role: "AGENT" });
  if (!agent) throw new HttpError(404, "Agent not found");

  if (input.email && input.email.toLowerCase() !== agent.email) {
    const existingEmail = await UserModel.findOne({
      email: input.email.toLowerCase(),
      _id: { $ne: id },
    });
    if (existingEmail) throw new HttpError(409, "Email already exists");
  }

  if (input.phone && input.phone !== agent.mobile) {
    const existingMobile = await UserModel.findOne({
      mobile: input.phone,
      _id: { $ne: id },
    });
    if (existingMobile) throw new HttpError(409, "Phone already exists");
  }

  Object.assign(agent, {
    ...input,
    email: input.email ? input.email.toLowerCase() : agent.email,
    mobile: input.phone || agent.mobile,
  });

  await agent.save();

  await logActivity(req.user!.id, req.user!.role, "UPDATE", "AGENT", agent.id, {
    agentName: agent.fullName,
  });

  return sendData(res, agent);
}

export async function updateAgentStatus(req: Request, res: Response) {
  const { id } = req.params;
  const { status } = updateStatusSchema.parse(req.body);

  const agent = await UserModel.findOne({ _id: id, role: "AGENT" });
  if (!agent) throw new HttpError(404, "Agent not found");

  agent.status = status;
  await agent.save();
  if (status === "SUSPENDED") {
    const now = new Date();
    await AuthSessionModel.updateMany(
      { userId: agent._id, revokedAt: null },
      { $set: { revokedAt: now, expiresAt: now } },
    );
  }

  await logActivity(
    req.user!.id,
    req.user!.role,
    "UPDATE_STATUS",
    "AGENT",
    agent.id,
    { status, agentName: agent.fullName },
  );

  return sendData(res, agent);
}

export async function updateAgentValidity(req: Request, res: Response) {
  const { id } = req.params;
  const { trialEndDate } = updateValiditySchema.parse(req.body);
  const agent = await UserModel.findOne({ _id: id, role: "AGENT" });
  if (!agent) throw new HttpError(404, "Agent not found");

  agent.trialEndDate = new Date(`${trialEndDate}T23:59:59.999Z`);
  await agent.save();
  await logActivity(
    req.user!.id,
    req.user!.role,
    "UPDATE_VALIDITY",
    "AGENT",
    agent.id,
    { trialEndDate },
  );
  return sendData(res, agent);
}

export async function resetAgentPassword(req: Request, res: Response) {
  const { id } = req.params;
  const { newPassword } = resetAgentPasswordSchema.parse(req.body);
  const agent = await UserModel.findOne({ _id: id, role: "AGENT" });
  if (!agent) throw new HttpError(404, "Agent not found");

  agent.passwordHash = await bcrypt.hash(newPassword, 6);
  await agent.save();
  const now = new Date();
  await AuthSessionModel.updateMany(
    { userId: agent._id, revokedAt: null },
    { $set: { revokedAt: now, expiresAt: now } },
  );
  await logActivity(
    req.user!.id,
    req.user!.role,
    "RESET_PASSWORD",
    "AGENT",
    agent.id,
    {
      agentName: agent.fullName,
    },
  );
  return sendData(res, { success: true });
}

export async function deleteAgent(req: Request, res: Response) {
  const { id } = req.params;
  const agentId = Array.isArray(id) ? id[0] : id;

  const agent = await UserModel.findOne({ _id: agentId, role: "AGENT" });
  if (!agent) throw new HttpError(404, "Agent not found");

  await UserModel.deleteOne({ _id: agentId });
  const now = new Date();
  await AuthSessionModel.updateMany(
    { userId: agentId, revokedAt: null },
    { $set: { revokedAt: now, expiresAt: now } },
  );

  await logActivity(
    req.user!.id,
    req.user!.role,
    "DELETE",
    "AGENT",
    String(agent._id),
    { agentName: agent.fullName },
  );

  return sendData(res, { success: true });
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function getActivityFilter(req: Request) {
  const filter: Record<string, unknown> = {};
  const { actorId, entity, actorRole, action, from, to, ip, search } =
    req.query;
  if (actorId && typeof actorId === "string") filter.actorId = actorId;
  if (entity && typeof entity === "string") filter.entity = entity;
  if (
    actorRole === "AGENT" ||
    actorRole === "SUPER_ADMIN" ||
    actorRole === "UNKNOWN"
  ) {
    filter.actorRole = actorRole;
  }
  if (action === "LOGIN" || action === "LOGIN_FAILED" || action === "LOGOUT") {
    filter.action = action;
  }
  if (ip && typeof ip === "string")
    filter.ipAddress = { $regex: escapeRegex(ip), $options: "i" };
  if (from && typeof from === "string") {
    const fromDate = new Date(from);
    if (Number.isNaN(fromDate.getTime()))
      throw new HttpError(400, "Invalid start date.");
    filter.createdAt = { $gte: fromDate };
  }
  if (to && typeof to === "string") {
    const toDate = new Date(to);
    if (Number.isNaN(toDate.getTime()))
      throw new HttpError(400, "Invalid end date.");
    toDate.setUTCDate(toDate.getUTCDate() + 1);
    filter.createdAt = {
      ...((filter.createdAt as Record<string, unknown> | undefined) ?? {}),
      $lt: toDate,
    };
  }
  if (search && typeof search === "string") {
    const trimmedSearch = search.trim().slice(0, 100);
    if (!trimmedSearch) return filter;
    const safeSearch = escapeRegex(trimmedSearch);
    const actors = await UserModel.find({
      $or: [
        { fullName: { $regex: safeSearch, $options: "i" } },
        { email: { $regex: safeSearch, $options: "i" } },
      ],
    }).select("_id");
    const actorIds = actors.map((actor) => actor._id);
    filter.$or = [
      { actorId: { $in: actorIds } },
      { "metadata.attemptedEmail": { $regex: safeSearch, $options: "i" } },
    ];
  }
  return filter;
}

function csvCell(value: unknown) {
  let text =
    value == null ? "" : typeof value === "string" ? value : String(value);
  if (/^[\s]*[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

function toActivityCsv<
  T extends {
    actorId?: unknown;
    metadata: unknown;
    createdAt: Date;
    actorRole: string;
    action: string;
    ipAddress?: string | null;
  },
>(activities: T[]) {
  const headers = [
    "Timestamp",
    "User",
    "Email",
    "Role",
    "Action",
    "IP",
    "Browser",
    "Operating System",
    "Device",
    "Location",
    "Suspicious Login",
    "Attempted Email",
  ];
  const lines = activities.map((activity) => {
    const actor = activity.actorId as unknown as {
      fullName?: string;
      email?: string;
    } | null;
    const metadata = activity.metadata as Record<string, unknown>;
    const location = metadata["location"] as
      { latitude?: number; longitude?: number } | undefined;
    return [
      activity.createdAt.toISOString(),
      actor?.fullName ?? "",
      actor?.email ?? String(metadata["attemptedEmail"] ?? ""),
      activity.actorRole,
      activity.action,
      activity.ipAddress ?? "",
      metadata["browser"] ?? "",
      metadata["operatingSystem"] ?? "",
      metadata["deviceType"] ?? "",
      location ? `${location.latitude ?? ""}, ${location.longitude ?? ""}` : "",
      metadata["suspiciousLogin"] ? "Yes" : "No",
      metadata["attemptedEmail"] ?? "",
    ]
      .map(csvCell)
      .join(",");
  });
  return [headers.map(csvCell).join(","), ...lines].join("\r\n");
}

export async function listActivity(req: Request, res: Response) {
  const page = Math.max(1, Number(req.query["page"]) || 1);
  const limit = Math.min(100, Math.max(10, Number(req.query["limit"]) || 10));
  const skip = (page - 1) * limit;
  const filter = await getActivityFilter(req);

  const [activities, total] = await Promise.all([
    ActivityLogModel.find(filter)
      .skip(skip)
      .limit(limit)
      .sort({ createdAt: -1, _id: -1 })
      .populate("actorId", "fullName email"),
    ActivityLogModel.countDocuments(filter),
  ]);

  return sendData(res, {
    data: activities,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  });
}

export async function exportActivity(req: Request, res: Response) {
  const filter = await getActivityFilter(req);
  const total = await ActivityLogModel.countDocuments(filter);
  if (total > 10_000) {
    throw new HttpError(
      413,
      "More than 10,000 rows match. Narrow the date range or filters before exporting.",
    );
  }
  const activities = await ActivityLogModel.find(filter)
    .sort({ createdAt: -1, _id: -1 })
    .populate("actorId", "fullName email");
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader(
    "Content-Disposition",
    'attachment; filename="activity-log.csv"',
  );
  return res.send(`\uFEFF${toActivityCsv(activities)}`);
}

export async function listActiveSessions(_req: Request, res: Response) {
  const now = new Date();
  const sessions = await AuthSessionModel.find({
    revokedAt: null,
    expiresAt: { $gt: now },
    absoluteExpiresAt: { $gt: now },
  })
    .sort({ lastActivityAt: -1 })
    .limit(500)
    .populate("userId", "fullName email role");
  return sendData(
    res,
    sessions.map((session) => {
      const user = session.userId as unknown as {
        _id: { toString(): string };
        fullName: string;
        email: string;
        role: string;
      } | null;
      return {
        id: String(session._id),
        user: user
          ? {
              id: user._id.toString(),
              fullName: user.fullName,
              email: user.email,
              role: user.role,
            }
          : null,
        browser: session.browser,
        operatingSystem: session.operatingSystem,
        deviceType: session.deviceType,
        ipAddress: session.ipAddress,
        location: session.location,
        createdAt: session.createdAt,
        lastActivityAt: session.lastActivityAt,
        expiresAt: session.expiresAt,
      };
    }),
  );
}

export async function revokeSession(req: Request, res: Response) {
  const sessionId = req.params["id"];
  const session = await AuthSessionModel.findOneAndUpdate(
    {
      _id: sessionId,
      revokedAt: null,
      expiresAt: { $gt: new Date() },
      absoluteExpiresAt: { $gt: new Date() },
    },
    { $set: { revokedAt: new Date(), expiresAt: new Date() } },
  );
  if (!session) throw new HttpError(404, "Active session not found.");
  await recordActivity(
    req.user!.id,
    req.user!.role,
    "REVOKE_SESSION",
    "SESSION",
    String(session._id),
    { userId: String(session.userId), userRole: session.userRole },
    req.ip,
  );
  return sendData(res, { success: true });
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
