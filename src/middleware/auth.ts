import type { NextFunction, Request, Response } from "express";
import jwt, { type JwtPayload } from "jsonwebtoken";
import { env } from "../config/env.js";
import { UserModel } from "../models/User.js";
import { AuthSessionModel } from "../models/AuthSession.js";
import {
  ACCOUNT_VALIDITY_EXPIRED_CODE,
  ACCOUNT_VALIDITY_EXPIRED_MESSAGE,
  HttpError,
  isValidityExpired,
} from "../utils/http.js";

export async function requireAuth(
  req: Request,
  _res: Response,
  next: NextFunction,
) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      throw new HttpError(401, "No token provided");
    }

    const token = authHeader.substring(7);
    const payload = jwt.verify(token, env.JWT_SECRET) as JwtPayload;
    if (!payload.sub || !payload.jti)
      throw new HttpError(401, "Your session is invalid.");

    const now = new Date();
    const activeSession = await AuthSessionModel.findOne({
      _id: payload.jti,
      userId: payload.sub,
      revokedAt: null,
      expiresAt: { $gt: now },
      absoluteExpiresAt: { $gt: now },
    });
    if (!activeSession)
      throw new HttpError(401, "Your session has expired or was revoked.");
    const refreshedSession = await AuthSessionModel.updateOne(
      { _id: activeSession._id, revokedAt: null, expiresAt: { $gt: now } },
      {
        $set: {
          lastActivityAt: now,
          expiresAt: new Date(
            Math.min(
              now.getTime() + 30 * 60 * 1000,
              activeSession.absoluteExpiresAt.getTime(),
            ),
          ),
        },
      },
    );
    if (refreshedSession.matchedCount === 0) {
      throw new HttpError(401, "Your session has expired or was revoked.");
    }

    const user = await UserModel.findById(payload.sub).select(
      "role fullName email mobile businessName status trialEndDate",
    );
    if (!user) throw new HttpError(401, "Your session is no longer valid.");

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

    req.user = {
      id: String(user._id),
      role: user.role,
      fullName: user.fullName,
      email: user.email,
      mobile: user.mobile,
      ...(user.businessName ? { businessName: user.businessName } : {}),
      status: user.status,
      sessionId: String(activeSession._id),
    };
    next();
  } catch (error) {
    next(
      error instanceof HttpError
        ? error
        : new HttpError(401, "Your session is invalid or expired."),
    );
  }
}

export function requireAdmin(req: Request, _res: Response, next: NextFunction) {
  if (req.user?.role !== "SUPER_ADMIN")
    return next(new HttpError(403, "Administrator access is required."));
  next();
}
