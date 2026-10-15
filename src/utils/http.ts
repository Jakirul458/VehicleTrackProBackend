import type { Response } from "express";

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

export const ACCOUNT_VALIDITY_EXPIRED_CODE = "ACCOUNT_VALIDITY_EXPIRED";
export const ACCOUNT_VALIDITY_EXPIRED_MESSAGE =
  "Your 7-day free trial or account validity has ended. Contact admin at 6294527072 to purchase the 1-year plan for ₹4,999 and extend your access.";

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
  return expiry.getTime() <= Date.now();
}
