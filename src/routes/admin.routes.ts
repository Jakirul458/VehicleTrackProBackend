import { Router } from "express";
import {
  listAgents,
  getAgent,
  createAgent,
  updateAgent,
  updateAgentStatus,
  updateAgentValidity,
  deleteAgent,
  listActivity,
  getDashboardStats,
} from "../controllers/admin.controller.js";
import { requireAuth, requireAdmin } from "../middleware/auth.js";

const router = Router();

// Dashboard
router.get("/dashboard", requireAuth, requireAdmin, getDashboardStats);

// Agent management
router.get("/agents", requireAuth, requireAdmin, listAgents);
router.post("/agents", requireAuth, requireAdmin, createAgent);
router.get("/agents/:id", requireAuth, requireAdmin, getAgent);
router.put("/agents/:id", requireAuth, requireAdmin, updateAgent);
router.patch("/agents/:id/status", requireAuth, requireAdmin, updateAgentStatus);
router.patch("/agents/:id/validity", requireAuth, requireAdmin, updateAgentValidity);
router.delete("/agents/:id", requireAuth, requireAdmin, deleteAgent);

// Activity log
router.get("/activity", requireAuth, requireAdmin, listActivity);

export default router;
