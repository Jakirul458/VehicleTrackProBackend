import type { Request, Response } from "express";
import { z } from "zod";
import { SubscriptionPlanModel } from "../models/SubscriptionPlan.js";
import { HttpError, sendData } from "../utils/http.js";

const planSchema = z.object({
  name: z.string().trim().min(2).max(100),
  description: z.string().trim().min(5).max(300),
  original_price: z.number().finite().min(0),
  current_price: z.number().finite().min(0),
  offer_tag: z.string().trim().max(80).default(""),
});
const idSchema = z
  .string()
  .regex(/^[a-f\d]{24}$/i, "Invalid subscription plan ID.");

export async function listPlans(_req: Request, res: Response) {
  const plans = await SubscriptionPlanModel.find().sort({
    createdAt: 1,
    _id: 1,
  });
  return sendData(res, plans);
}

export async function createPlan(req: Request, res: Response) {
  const plan = await SubscriptionPlanModel.create(planSchema.parse(req.body));
  return sendData(res, plan, 201);
}

export async function updatePlan(req: Request, res: Response) {
  const id = idSchema.parse(req.params["id"]);
  const plan = await SubscriptionPlanModel.findByIdAndUpdate(
    id,
    planSchema.parse(req.body),
    { new: true, runValidators: true },
  );
  if (!plan) throw new HttpError(404, "Subscription plan not found.");
  return sendData(res, plan);
}

export async function deletePlan(req: Request, res: Response) {
  const id = idSchema.parse(req.params["id"]);
  const plan = await SubscriptionPlanModel.findByIdAndDelete(id);
  if (!plan) throw new HttpError(404, "Subscription plan not found.");
  return sendData(res, { id: String(plan._id) });
}
