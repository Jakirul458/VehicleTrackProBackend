import type { Request, Response } from "express";
import jwt, { type JwtPayload, type SignOptions } from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { env } from "../config/env.js";
import { UserModel } from "../models/User.js";
import { ActivityLogModel, recordActivity } from "../models/ActivityLog.js";
import { AuthSessionModel, type LoginLocation } from "../models/AuthSession.js";
import type { Role } from "../models/User.js";
import {
  ACCOUNT_VALIDITY_EXPIRED_CODE,
  ACCOUNT_VALIDITY_EXPIRED_MESSAGE,
  HttpError,
  isValidityExpired,
  publicUser,
  sendData,
} from "../utils/http.js";

const PUBLIC_TRIAL_MONTHS = 1;
const IDLE_TIMEOUT_MS = 30 * 60 * 1000;
const ABSOLUTE_TIMEOUT_MS = 12 * 60 * 60 * 1000;

const loginSchema = z.object({
  email: z.string().trim().email().max(254),
  password: z.string().min(1).max(200),
  location: z
    .object({
      latitude: z.number().min(-90).max(90),
      longitude: z.number().min(-180).max(180),
      accuracy: z.number().min(0).max(100_000),
    })
    .optional(),
});

const publicSignupSchema = z.object({
  fullName: z.string().trim().min(2).max(120),
  businessName: z.string().trim().min(2).max(160),
  email: z.string().trim().email().max(254),
  mobile: z
    .string()
    .trim()
    .regex(/^\+?[0-9]{10,15}$/),
  password: z.string().min(8).max(200),
});

const setupSuperAdminSchema = z.object({
  setupKey: z.string().min(32),
  fullName: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(254),
  password: z.string().min(6).max(200),
  mobile: z.string().trim().min(10).max(15),
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(200),
  newPassword: z.string().min(6).max(200),
});

const updateProfileSchema = z.object({
  fullName: z.string().trim().min(2).max(120),
  businessName: z.string().trim().min(2).max(160),
  email: z.string().trim().email().max(254),
  mobile: z
    .string()
    .trim()
    .regex(/^\+?[0-9]{10,15}$/),
  address: z.string().trim().max(500).optional(),
  city: z.string().trim().max(120).optional(),
  state: z.string().trim().max(120).optional(),
  pinCode: z.string().trim().max(20).optional(),
});

function generateToken(userId: string, role: string, sessionId: string) {
  return jwt.sign({ role }, env.JWT_SECRET, {
    subject: userId,
    jwtid: sessionId,
    expiresIn: env.JWT_EXPIRES_IN as NonNullable<SignOptions["expiresIn"]>,
  });
}

function getDeviceInfo(userAgent: string) {
  const browser = /Edg\//.test(userAgent)
    ? "Microsoft Edge"
    : /Firefox\//.test(userAgent)
      ? "Firefox"
      : /Chrome\//.test(userAgent)
        ? "Chrome"
        : /Safari\//.test(userAgent) && !/Chrome\//.test(userAgent)
          ? "Safari"
          : "Unknown browser";
  const operatingSystem = /Windows NT/.test(userAgent)
    ? "Windows"
    : /Android/.test(userAgent)
      ? "Android"
      : /iPhone|iPad|iPod/.test(userAgent)
        ? "iOS"
        : /Mac OS X/.test(userAgent)
          ? "macOS"
          : /Linux/.test(userAgent)
            ? "Linux"
            : "Unknown OS";
  const deviceType = /Mobi|Android|iPhone|iPad|iPod/i.test(userAgent)
    ? "Mobile"
    : "Desktop";
  return { browser, operatingSystem, deviceType };
}

async function createLoginSession(
  user: { _id: { toString(): string }; role: Role },
  req: Request,
  location?: LoginLocation,
) {
  const userAgent = (req.get("user-agent") ?? "").slice(0, 500);
  const device = getDeviceInfo(userAgent);
  const ipAddress = req.ip;
  const priorLogin = await ActivityLogModel.findOne({
    actorId: user._id,
    action: "LOGIN",
    entity: "SESSION",
    createdAt: { $gte: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000) },
  })
    .sort({ createdAt: -1 })
    .lean();
  const previousMetadata = priorLogin?.metadata as
    Record<string, unknown> | undefined;
  const suspiciousLogin =
    !!priorLogin &&
    (priorLogin.ipAddress !== ipAddress ||
      previousMetadata?.["browser"] !== device.browser ||
      previousMetadata?.["operatingSystem"] !== device.operatingSystem ||
      previousMetadata?.["deviceType"] !== device.deviceType);

  const now = new Date();
  const absoluteExpiresAt = new Date(now.getTime() + ABSOLUTE_TIMEOUT_MS);
  const session = await AuthSessionModel.create({
    userId: user._id,
    userRole: user.role,
    ...device,
    userAgent,
    ...(ipAddress ? { ipAddress } : {}),
    ...(location ? { location } : {}),
    createdAt: now,
    lastActivityAt: now,
    expiresAt: new Date(
      Math.min(now.getTime() + IDLE_TIMEOUT_MS, absoluteExpiresAt.getTime()),
    ),
    absoluteExpiresAt,
  });
  const token = generateToken(String(user._id), user.role, String(session._id));
  await recordActivity(
    String(user._id),
    user.role,
    "LOGIN",
    "SESSION",
    String(session._id),
    {
      ...device,
      ...(location ? { location } : {}),
      ...(suspiciousLogin ? { suspiciousLogin: true } : {}),
    },
    ipAddress,
  );
  return token;
}

async function recordFailedLogin(
  req: Request,
  email: string,
  user: { id: string; role: Role } | null,
  reason: string,
) {
  const userAgent = (req.get("user-agent") ?? "").slice(0, 500);
  await recordActivity(
    user?.id,
    user?.role ?? "UNKNOWN",
    "LOGIN_FAILED",
    "SESSION",
    user?.id ?? "unknown",
    {
      attemptedEmail: email,
      reason,
      ...getDeviceInfo(userAgent),
    },
    req.ip,
  );
}

export async function login(req: Request, res: Response) {
  const input = loginSchema.parse(req.body);
  const email = input.email.toLowerCase();
  const user = await UserModel.findOne({ email }).select("+passwordHash");
  if (!user || !(await bcrypt.compare(input.password, user.passwordHash))) {
    await recordFailedLogin(
      req,
      email,
      user ? { id: String(user._id), role: user.role } : null,
      "INVALID_CREDENTIALS",
    );
    throw new HttpError(
      401,
      "Invalid email or password.",
      "INVALID_CREDENTIALS",
    );
  }
  if (user.status === "SUSPENDED") {
    await recordFailedLogin(
      req,
      email,
      { id: String(user._id), role: user.role },
      "ACCOUNT_SUSPENDED",
    );
    throw new HttpError(
      403,
      "This account is suspended. Please contact the administrator.",
      "ACCOUNT_SUSPENDED",
    );
  }
  if (user.role === "AGENT" && isValidityExpired(user.trialEndDate)) {
    await recordFailedLogin(
      req,
      email,
      { id: String(user._id), role: user.role },
      "ACCOUNT_VALIDITY_EXPIRED",
    );
    throw new HttpError(
      403,
      ACCOUNT_VALIDITY_EXPIRED_MESSAGE,
      ACCOUNT_VALIDITY_EXPIRED_CODE,
    );
  }
  const token = await createLoginSession(user, req, input.location);
  return sendData(res, {
    user: publicUser(user.toObject() as unknown as Record<string, unknown>),
    token,
  });
}

export async function publicSignup(req: Request, res: Response) {
  const input = publicSignupSchema.parse(req.body);
  const email = input.email.toLowerCase();
  const existingUser = await UserModel.findOne({
    $or: [{ email }, { mobile: input.mobile }],
  });
  if (existingUser) {
    throw new HttpError(
      409,
      "This email or mobile number is already registered. Sign in to your existing account or use different contact details.",
    );
  }

  const passwordHash = await bcrypt.hash(input.password, 6);
  const trialEndDate = new Date();
  const signupDay = trialEndDate.getDate();
  trialEndDate.setDate(1);
  trialEndDate.setMonth(trialEndDate.getMonth() + PUBLIC_TRIAL_MONTHS);
  const lastDayOfTrialMonth = new Date(
    trialEndDate.getFullYear(),
    trialEndDate.getMonth() + 1,
    0,
  ).getDate();
  trialEndDate.setDate(Math.min(signupDay, lastDayOfTrialMonth));
  const user = await UserModel.create({
    fullName: input.fullName,
    businessName: input.businessName,
    email,
    mobile: input.mobile,
    passwordHash,
    role: "AGENT",
    status: "ACTIVE",
    trialEndDate,
  });

  await recordActivity(
    String(user._id),
    user.role,
    "REGISTER",
    "AGENT",
    String(user._id),
    {},
    req.ip,
  );
  const token = await createLoginSession(user, req);
  return sendData(
    res,
    {
      user: publicUser(user.toObject() as unknown as Record<string, unknown>),
      token,
    },
    201,
  );
}

export async function superAdminLogin(req: Request, res: Response) {
  const input = loginSchema.parse(req.body);
  const email = input.email.toLowerCase();
  const user = await UserModel.findOne({ email, role: "SUPER_ADMIN" }).select(
    "+passwordHash",
  );
  if (!user || !(await bcrypt.compare(input.password, user.passwordHash))) {
    await recordFailedLogin(
      req,
      email,
      user ? { id: String(user._id), role: user.role } : null,
      "INVALID_CREDENTIALS",
    );
    throw new HttpError(
      401,
      "Invalid email or password.",
      "INVALID_CREDENTIALS",
    );
  }
  if (user.status === "SUSPENDED") {
    await recordFailedLogin(
      req,
      email,
      { id: String(user._id), role: user.role },
      "ACCOUNT_SUSPENDED",
    );
    throw new HttpError(
      403,
      "This account is suspended. Please contact the administrator.",
      "ACCOUNT_SUSPENDED",
    );
  }
  const token = await createLoginSession(user, req, input.location);
  return sendData(res, {
    user: publicUser(user.toObject() as unknown as Record<string, unknown>),
    token,
  });
}

export async function setupSuperAdmin(req: Request, res: Response) {
  const input = setupSuperAdminSchema.parse(req.body);

  if (input.setupKey !== env.SUPER_ADMIN_SETUP_KEY) {
    throw new HttpError(403, "Invalid setup key.");
  }

  const existingAdmin = await UserModel.findOne({ role: "SUPER_ADMIN" });
  if (existingAdmin) {
    throw new HttpError(400, "Super admin already exists.");
  }

  const passwordHash = await bcrypt.hash(input.password, 6);
  const user = await UserModel.create({
    fullName: input.fullName,
    email: input.email.toLowerCase(),
    mobile: input.mobile,
    passwordHash,
    role: "SUPER_ADMIN",
    status: "ACTIVE",
  });

  const token = await createLoginSession(user, req);
  return sendData(
    res,
    {
      user: publicUser(user.toObject() as unknown as Record<string, unknown>),
      token,
    },
    201,
  );
}

export async function changePassword(req: Request, res: Response) {
  const input = changePasswordSchema.parse(req.body);
  const user = await UserModel.findById(req.user?.id).select("+passwordHash");
  if (!user) throw new HttpError(401, "User not found.");

  const isValid = await bcrypt.compare(
    input.currentPassword,
    user.passwordHash,
  );
  if (!isValid) {
    throw new HttpError(401, "Current password is incorrect.");
  }

  user.passwordHash = await bcrypt.hash(input.newPassword, 6);
  await user.save();
  const now = new Date();
  await AuthSessionModel.updateMany(
    {
      userId: user._id,
      revokedAt: null,
      ...(req.user?.sessionId ? { _id: { $ne: req.user.sessionId } } : {}),
    },
    { $set: { revokedAt: now, expiresAt: now } },
  );
  await recordActivity(
    String(user._id),
    user.role,
    "CHANGE_PASSWORD",
    "ACCOUNT",
    String(user._id),
    {},
    req.ip,
  );

  return sendData(res, { success: true });
}

export async function me(req: Request, res: Response) {
  const user = await UserModel.findById(req.user?.id);
  if (!user) throw new HttpError(401, "Your session is no longer valid.");
  return sendData(
    res,
    publicUser(user.toObject() as unknown as Record<string, unknown>),
  );
}

export async function updateProfile(req: Request, res: Response) {
  if (req.user?.role !== "AGENT") {
    throw new HttpError(403, "Only agents can update this profile.");
  }
  const input = updateProfileSchema.parse(req.body);
  const user = await UserModel.findById(req.user.id);
  if (!user || user.role !== "AGENT")
    throw new HttpError(401, "Your session is no longer valid.");

  const email = input.email.toLowerCase();
  const duplicate = await UserModel.findOne({
    _id: { $ne: user._id },
    $or: [{ email }, { mobile: input.mobile }],
  });
  if (duplicate)
    throw new HttpError(409, "Email or mobile number is already in use.");

  Object.assign(user, { ...input, email });
  await user.save();
  await recordActivity(
    String(user._id),
    user.role,
    "UPDATE_PROFILE",
    "ACCOUNT",
    String(user._id),
    {},
    req.ip,
  );
  return sendData(
    res,
    publicUser(user.toObject() as unknown as Record<string, unknown>),
  );
}

export async function logout(req: Request, res: Response) {
  if (req.user) {
    if (req.user.sessionId) {
      await AuthSessionModel.updateOne(
        { _id: req.user.sessionId, revokedAt: null },
        { $set: { revokedAt: new Date(), expiresAt: new Date() } },
      );
    }
    await recordActivity(
      req.user.id,
      req.user.role,
      "LOGOUT",
      "SESSION",
      req.user.id,
      {},
      req.ip,
    );
  }
  return sendData(res, { success: true });
}

export async function logoutOnClose(req: Request, res: Response) {
  const token = z.string().min(1).max(10_000).parse(req.body);
  let payload: JwtPayload;
  try {
    payload = jwt.verify(token, env.JWT_SECRET) as JwtPayload;
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError) {
      throw new HttpError(401, "Your session is invalid or expired.");
    }
    throw error;
  }
  if (!payload.sub || !payload.jti)
    throw new HttpError(401, "Your session is invalid.");
  const session = await AuthSessionModel.findOneAndUpdate(
    {
      _id: payload.jti,
      userId: payload.sub,
      revokedAt: null,
      expiresAt: { $gt: new Date() },
      absoluteExpiresAt: { $gt: new Date() },
    },
    { $set: { revokedAt: new Date(), expiresAt: new Date() } },
  );
  if (session) {
    await recordActivity(
      String(session.userId),
      session.userRole,
      "LOGOUT",
      "SESSION",
      String(session._id),
      { reason: "TAB_CLOSED" },
      req.ip,
    );
  }
  return sendData(res, { success: true });
}
