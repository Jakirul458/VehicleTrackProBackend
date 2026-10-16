import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(5000),
  CLIENT_ORIGIN: z.string().url().default("http://localhost:5173"),

  MONGODB_URI: z.string().min(1),
  JWT_SECRET: z.string().min(32),
  JWT_EXPIRES_IN: z.string().default("7d"),

  COOKIE_NAME: z.string().default("vtp_session"),
  COOKIE_SAME_SITE: z.enum(["strict", "lax", "none"]).default("lax"),

  ADMIN_NAME: z.string().min(1),
  ADMIN_EMAIL: z.string().email(),
  ADMIN_MOBILE: z.string().min(10),
  ADMIN_PASSWORD: z.string().min(12),

  SUPER_ADMIN_SETUP_KEY: z.string().min(32),
  DEFAULT_EXPIRY_WARNING_DAYS: z.coerce.number().int().positive().default(7),
});

export const env = envSchema.parse(process.env);