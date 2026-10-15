import type { Request, Response } from "express";
import bcrypt from "bcryptjs";
import jwt, { type SignOptions } from "jsonwebtoken";
import { z } from "zod";
import { env } from "../config/env.js";
import { UserModel } from "../models/User.js";
import {
  ACCOUNT_VALIDITY_EXPIRED_CODE,
  ACCOUNT_VALIDITY_EXPIRED_MESSAGE,
  HttpError,
  isValidityExpired,
  publicUser,
  sendData,
} from "../utils/http.js";

const PUBLIC_TRIAL_DAYS = 7;
const DAY_IN_MS = 24 * 60 * 60 * 1000;

const loginSchema = z.object({
  email: z.string().trim().email().max(254),
  password: z.string().min(1).max(200),
});

const publicSignupSchema = z.object({
  fullName: z.string().trim().min(2).max(120),
  businessName: z.string().trim().min(2).max(160),
  email: z.string().trim().email().max(254),
  mobile: z.string().trim().regex(/^\+?[0-9]{10,15}$/),
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
  mobile: z.string().trim().regex(/^\+?[0-9]{10,15}$/),
  address: z.string().trim().max(500).optional(),
  city: z.string().trim().max(120).optional(),
  state: z.string().trim().max(120).optional(),
  pinCode: z.string().trim().max(20).optional(),
});

function generateToken(userId: string, role: string) {
  return jwt.sign({ role }, env.JWT_SECRET, {
    subject: userId,
    expiresIn: env.JWT_EXPIRES_IN as NonNullable<SignOptions["expiresIn"]>,
  });
}

export async function login(req: Request, res: Response) {
  const input = loginSchema.parse(req.body);
  const email = input.email.toLowerCase();
  const user = await UserModel.findOne({ email }).select("+passwordHash");
  if (!user || !(await bcrypt.compare(input.password, user.passwordHash))) {
    throw new HttpError(401, "Invalid email or password.");
  }
  if (user.status === "SUSPENDED") {
    throw new HttpError(403, "This account is suspended.");
  }
  if (user.role === "AGENT" && isValidityExpired(user.trialEndDate)) {
    throw new HttpError(
      403,
      ACCOUNT_VALIDITY_EXPIRED_MESSAGE,
      ACCOUNT_VALIDITY_EXPIRED_CODE,
    );
  }
  const token = generateToken(String(user._id), user.role);
  return sendData(res, { user: publicUser(user.toObject() as unknown as Record<string, unknown>), token });
}

export async function publicSignup(req: Request, res: Response) {
  const input = publicSignupSchema.parse(req.body);
  const email = input.email.toLowerCase();
  const existingUser = await UserModel.findOne({
    $or: [{ email }, { mobile: input.mobile }],
  });
  if (existingUser) {
    throw new HttpError(409, "An account with that email or mobile number already exists.");
  }

  const passwordHash = await bcrypt.hash(input.password, 6);
  const user = await UserModel.create({
    fullName: input.fullName,
    businessName: input.businessName,
    email,
    mobile: input.mobile,
    passwordHash,
    role: "AGENT",
    status: "ACTIVE",
    trialEndDate: new Date(Date.now() + PUBLIC_TRIAL_DAYS * DAY_IN_MS),
  });

  const token = generateToken(String(user._id), user.role);
  return sendData(
    res,
    { user: publicUser(user.toObject() as unknown as Record<string, unknown>), token },
    201,
  );
}

export async function superAdminLogin(req: Request, res: Response) {
  const input = loginSchema.parse(req.body);
  const email = input.email.toLowerCase();
  const user = await UserModel.findOne({ email, role: "SUPER_ADMIN" }).select("+passwordHash");
  if (!user || !(await bcrypt.compare(input.password, user.passwordHash))) {
    throw new HttpError(401, "Invalid super admin credentials.");
  }
  if (user.status === "SUSPENDED") {
    throw new HttpError(403, "This account is suspended.");
  }
  const token = generateToken(String(user._id), user.role);
  return sendData(res, { user: publicUser(user.toObject() as unknown as Record<string, unknown>), token });
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

  const token = generateToken(String(user._id), user.role);
  return sendData(res, { user: publicUser(user.toObject() as unknown as Record<string, unknown>), token }, 201);
}

export async function changePassword(req: Request, res: Response) {
  const input = changePasswordSchema.parse(req.body);
  const user = await UserModel.findById(req.user?.id).select("+passwordHash");
  if (!user) throw new HttpError(401, "User not found.");

  const isValid = await bcrypt.compare(input.currentPassword, user.passwordHash);
  if (!isValid) {
    throw new HttpError(401, "Current password is incorrect.");
  }

  user.passwordHash = await bcrypt.hash(input.newPassword, 6);
  await user.save();

  return sendData(res, { success: true });
}

export async function me(req: Request, res: Response) {
  const user = await UserModel.findById(req.user?.id);
  if (!user) throw new HttpError(401, "Your session is no longer valid.");
  return sendData(res, publicUser(user.toObject() as unknown as Record<string, unknown>));
}

export async function updateProfile(req: Request, res: Response) {
  if (req.user?.role !== "AGENT") {
    throw new HttpError(403, "Only agents can update this profile.");
  }
  const input = updateProfileSchema.parse(req.body);
  const user = await UserModel.findById(req.user.id);
  if (!user || user.role !== "AGENT") throw new HttpError(401, "Your session is no longer valid.");

  const email = input.email.toLowerCase();
  const duplicate = await UserModel.findOne({
    _id: { $ne: user._id },
    $or: [{ email }, { mobile: input.mobile }],
  });
  if (duplicate) throw new HttpError(409, "Email or mobile number is already in use.");

  Object.assign(user, { ...input, email });
  await user.save();
  return sendData(res, publicUser(user.toObject() as unknown as Record<string, unknown>));
}

export function logout(_req: Request, res: Response) {
  return sendData(res, { success: true });
}
