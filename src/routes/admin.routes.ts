import { Router } from "express";
import {
  listAgents,
  getAgent,
  createAgent,
  updateAgent,
  updateAgentStatus,
  updateAgentValidity,
  resetAgentPassword,
  deleteAgent,
  listActivity,
  exportActivity,
  listActiveSessions,
  revokeSession,
  getDashboardStats,
} from "../controllers/admin.controller.js";
import {
  getPublicSettings,
  updatePlatformSettings,
} from "../controllers/settings.controller.js";
import { requireAuth, requireAdmin } from "../middleware/auth.js";

const router = Router();

// Dashboard
router.get("/dashboard", requireAuth, requireAdmin, getDashboardStats);

// Agent management
router.get("/agents", requireAuth, requireAdmin, listAgents);
router.post("/agents", requireAuth, requireAdmin, createAgent);
router.get("/agents/:id", requireAuth, requireAdmin, getAgent);
router.put("/agents/:id", requireAuth, requireAdmin, updateAgent);
router.patch(
  "/agents/:id/status",
  requireAuth,
  requireAdmin,
  updateAgentStatus,
);
router.patch(
  "/agents/:id/validity",
  requireAuth,
  requireAdmin,
  updateAgentValidity,
);
router.patch(
  "/agents/:id/password",
  requireAuth,
  requireAdmin,
  resetAgentPassword,
);
router.delete("/agents/:id", requireAuth, requireAdmin, deleteAgent);
router.get("/settings", requireAuth, requireAdmin, getPublicSettings);
router.put("/settings", requireAuth, requireAdmin, updatePlatformSettings);

// Activity log
router.get("/activity/export", requireAuth, requireAdmin, exportActivity);
router.get("/activity", requireAuth, requireAdmin, listActivity);
router.get("/sessions", requireAuth, requireAdmin, listActiveSessions);
router.delete("/sessions/:id", requireAuth, requireAdmin, revokeSession);

export default router;
