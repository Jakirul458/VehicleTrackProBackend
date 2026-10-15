import { Router } from "express";
import { createResource, deleteResource, getResource, listCustomers, listResource, markResourceReminderDone, restoreResource, updateResource } from "../controllers/resource.controller.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();
router.use(requireAuth);
router.get("/customers", listCustomers);
router.get("/:resource", listResource);
router.post("/:resource", createResource);
router.get("/:resource/:id", getResource);
router.put("/:resource/:id", updateResource);
router.patch("/:resource/:id/reminder", markResourceReminderDone);
router.delete("/:resource/:id", deleteResource);
router.patch("/:resource/:id/restore", restoreResource);

export default router;
