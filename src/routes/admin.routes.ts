import { Router } from "express";
import {
  listAgents,
  getAgent,
  createAgent,
  updateAgent,
  updateAgentModuleAccess,
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
import {
  getSubscriptionPayment,
  listSubscriptionPayments,
  reviewSubscriptionPayment,
  listAgentSubscriptions,
  issueAgentSubscriptionInvoice,
  setAgentSubscription,
} from "../controllers/subscription-payments.controller.js";
import {
  createPlan,
  deletePlan,
  listPlans,
  updatePlan,
} from "../controllers/plans.controller.js";

const router = Router();

// Dashboard
router.get("/dashboard", requireAuth, requireAdmin, getDashboardStats);

// Agent management
router.get("/agents", requireAuth, requireAdmin, listAgents);
router.post("/agents", requireAuth, requireAdmin, createAgent);
router.get("/agents/:id", requireAuth, requireAdmin, getAgent);
router.put("/agents/:id", requireAuth, requireAdmin, updateAgent);
router.patch(
  "/agents/:id/module-access",
  requireAuth,
  requireAdmin,
  updateAgentModuleAccess,
);
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
router.get(
  "/agent-subscriptions",
  requireAuth,
  requireAdmin,
  listAgentSubscriptions,
);
router.patch(
  "/agents/:id/subscription",
  requireAuth,
  requireAdmin,
  setAgentSubscription,
);
router.post(
  "/agents/:id/subscription-invoices",
  requireAuth,
  requireAdmin,
  issueAgentSubscriptionInvoice,
);
router.get("/settings", requireAuth, requireAdmin, getPublicSettings);
router.put("/settings", requireAuth, requireAdmin, updatePlatformSettings);
router.get("/plans", requireAuth, requireAdmin, listPlans);
router.post("/plans", requireAuth, requireAdmin, createPlan);
router.put("/plans/:id", requireAuth, requireAdmin, updatePlan);
router.delete("/plans/:id", requireAuth, requireAdmin, deletePlan);
router.get(
  "/subscription-payments",
  requireAuth,
  requireAdmin,
  listSubscriptionPayments,
);
router.get(
  "/subscription-payments/:id",
  requireAuth,
  requireAdmin,
  getSubscriptionPayment,
);
router.patch(
  "/subscription-payments/:id",
  requireAuth,
  requireAdmin,
  reviewSubscriptionPayment,
);

// Activity log
router.get("/activity/export", requireAuth, requireAdmin, exportActivity);
router.get("/activity", requireAuth, requireAdmin, listActivity);
router.get("/sessions", requireAuth, requireAdmin, listActiveSessions);
router.delete("/sessions/:id", requireAuth, requireAdmin, revokeSession);

export default router;
