import { Router } from "express";
import {
  listVehicles,
  getVehicle,
  createVehicle,
  updateVehicle,
  deleteVehicle,
} from "../controllers/vehicle.controller.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

router.get("/vehicles", requireAuth, listVehicles);
router.post("/vehicles", requireAuth, createVehicle);
router.get("/vehicles/:id", requireAuth, getVehicle);
router.put("/vehicles/:id", requireAuth, updateVehicle);
router.delete("/vehicles/:id", requireAuth, deleteVehicle);

export default router;
