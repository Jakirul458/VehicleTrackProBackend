import type { Role } from "../models/User.js";

export interface AuthUser {
  id: string;
  role: Role;
  fullName: string;
  email: string;
  mobile?: string;
  businessName?: string;
  agentCode?: string;
  status?: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}
