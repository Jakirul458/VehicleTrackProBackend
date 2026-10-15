import { Router } from "express";
import {
  listCustomers,
  getCustomer,
  createCustomer,
  updateCustomer,
  deleteCustomer,
} from "../controllers/customer.controller.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

router.get("/customers", requireAuth, listCustomers);
router.post("/customers", requireAuth, createCustomer);
router.get("/customers/:id", requireAuth, getCustomer);
router.put("/customers/:id", requireAuth, updateCustomer);
router.delete("/customers/:id", requireAuth, deleteCustomer);

export default router;
