import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import { login, logout, me, setupSuperAdmin, changePassword, publicSignup, superAdminLogin, updateProfile } from "../controllers/auth.controller.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: true, legacyHeaders: false });
const signupLimiter = rateLimit({ windowMs: 60 * 60 * 1000, limit: 5, standardHeaders: true, legacyHeaders: false });

router.post("/login", authLimiter, login);
router.post("/register", signupLimiter, publicSignup);
router.post("/setup-super-admin", setupSuperAdmin);
router.post("/superadmin", authLimiter, superAdminLogin);
router.post("/logout", requireAuth, logout);
router.post("/change-password", requireAuth, changePassword);
router.patch("/profile", requireAuth, updateProfile);
router.get("/me", requireAuth, me);

export default router;
