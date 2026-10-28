import { Router } from "express";
import authRoutes from "./auth.routes.js";
import adminRoutes from "./admin.routes.js";
import resourceRoutes from "./resource.routes.js";
import reportRoutes from "./report.routes.js";
import { getPublicSettings } from "../controllers/settings.controller.js";

const router = Router();
router.use("/auth", authRoutes);
router.use("/admin", adminRoutes);
router.use("/reports", reportRoutes);
router.get("/settings/payment", getPublicSettings);
router.use("/", resourceRoutes);

export default router;
