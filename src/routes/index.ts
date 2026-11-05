import { Router } from "express";
import authRoutes from "./auth.routes.js";
import adminRoutes from "./admin.routes.js";
import resourceRoutes from "./resource.routes.js";
import reportRoutes from "./report.routes.js";
import { getPublicSettings } from "../controllers/settings.controller.js";
import { listPlans } from "../controllers/plans.controller.js";
import {
  getMyInvoice,
  listMySubscriptionPayments,
  submitSubscriptionPayment,
} from "../controllers/subscription-payments.controller.js";
import { requirePaymentAuth } from "../middleware/auth.js";

const router = Router();
router.use("/auth", authRoutes);
router.use("/admin", adminRoutes);
router.use("/reports", reportRoutes);
router.get("/settings/payment", getPublicSettings);
router.get("/plans", listPlans);
router.post(
  "/payments/submissions",
  requirePaymentAuth,
  submitSubscriptionPayment,
);
router.get(
  "/payments/submissions",
  requirePaymentAuth,
  listMySubscriptionPayments,
);
router.get("/payments/invoices/:id", requirePaymentAuth, getMyInvoice);
router.use("/", resourceRoutes);

export default router;
