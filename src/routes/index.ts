import { Router } from "express";
import authRoutes from "./auth.routes.js";
import adminRoutes from "./admin.routes.js";
import customerRoutes from "./customer.routes.js";
import vehicleRoutes from "./vehicle.routes.js";
import agentRoutes from "./agent.routes.js";
import resourceRoutes from "./resource.routes.js";
import reportRoutes from "./report.routes.js";

const router = Router();
router.use("/auth", authRoutes);
router.use("/admin", adminRoutes);
router.use("/customers", customerRoutes);
router.use("/vehicles", vehicleRoutes);
router.use("/agents", agentRoutes);
router.use("/reports", reportRoutes);
router.use("/", resourceRoutes);

export default router;
