import { Router } from "express";
import { adminDashboard, agentDashboard, agentFinancialSummary, paymentRecords } from "../controllers/report.controller.js";
import { requireAdmin, requireAuth } from "../middleware/auth.js";

const router = Router();
router.use(requireAuth);
router.get("/dashboard", agentDashboard);
router.get("/agent-finances", agentFinancialSummary);
router.get("/payments", paymentRecords);
router.get("/admin-dashboard", requireAdmin, adminDashboard);

export default router;
