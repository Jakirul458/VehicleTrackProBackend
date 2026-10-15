import type { Response } from "express";

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

export function sendData<T>(res: Response, data: T, status = 200) {
  return res.status(status).json({ success: true, data });
}

export function publicUser(user: Record<string, unknown>) {
  const id = String(user["_id"] ?? user["id"] ?? "");
  return {
    id,
    fullName: user["fullName"],
    email: user["email"],
    mobile: user["mobile"],
    role: user["role"],
    businessName: user["businessName"],
    address: user["address"],
    city: user["city"],
    state: user["state"],
    pinCode: user["pinCode"],
    agentCode: user["agentCode"],
    plan: user["plan"],
    status: user["status"],
    trialEndDate: user["trialEndDate"],
    createdAt: user["createdAt"],
    updatedAt: user["updatedAt"],
  };
}

export function isValidityExpired(value: Date | string | null | undefined) {
  if (!value) return false;
  const expiry = new Date(value);
  if (Number.isNaN(expiry.getTime())) return false;
  const expiryDay = Date.UTC(expiry.getUTCFullYear(), expiry.getUTCMonth(), expiry.getUTCDate());
  const today = new Date();
  const todayDay = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  return expiryDay < todayDay;
}
