import { Router } from "express";
import { createAgent, listAgents, updateAgent, updateAgentPassword, updateAgentStatus, extendAgentValidity } from "../controllers/agent.controller.js";
import { requireAdmin, requireAuth } from "../middleware/auth.js";

const router = Router();
router.use(requireAuth, requireAdmin);
router.get("/", listAgents);
router.post("/", createAgent);
router.patch("/:id", updateAgent);
router.patch("/:id/status", updateAgentStatus);
router.patch("/:id/password", updateAgentPassword);
router.patch("/:id/extend-validity", extendAgentValidity);

export default router;
