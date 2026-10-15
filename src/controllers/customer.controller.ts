import type { Request, Response } from "express";
import { z } from "zod";
import { CustomerModel } from "../models/Customer.js";
import { HttpError, sendData } from "../utils/http.js";

const createCustomerSchema = z.object({
  fullName: z.string().trim().min(2).max(120),
  phone: z.string().trim().min(10).max(20),
  email: z.string().trim().email().max(254).optional(),
  address: z.string().trim().max(500).optional(),
  city: z.string().trim().optional(),
  state: z.string().trim().optional(),
  pinCode: z.string().trim().optional(),
  notes: z.string().trim().optional(),
});

const updateCustomerSchema = z.object({
  fullName: z.string().trim().min(2).max(120).optional(),
  phone: z.string().trim().min(10).max(20).optional(),
  email: z.string().trim().email().max(254).optional(),
  address: z.string().trim().max(500).optional(),
  city: z.string().trim().optional(),
  state: z.string().trim().optional(),
  pinCode: z.string().trim().optional(),
  notes: z.string().trim().optional(),
});

export async function listCustomers(req: Request, res: Response) {
  const { page = 1, limit = 20, search } = req.query;
  const skip = (Number(page) - 1) * Number(limit);

  const filter: Record<string, unknown> = { agentId: req.user!.id, deletedAt: null };
  if (search) {
    filter.$or = [
      { fullName: { $regex: search, $options: "i" } },
      { phone: { $regex: search, $options: "i" } },
      { email: { $regex: search, $options: "i" } },
    ];
  }

  const [customers, total] = await Promise.all([
    CustomerModel.find(filter).skip(skip).limit(Number(limit)).sort({ createdAt: -1 }),
    CustomerModel.countDocuments(filter),
  ]);

  return sendData(res, {
    data: customers,
    pagination: { page: Number(page), limit: Number(limit), total, pages: Math.ceil(total / Number(limit)) },
  });
}

export async function getCustomer(req: Request, res: Response) {
  const { id } = req.params;
  const customerId = Array.isArray(id) ? id[0] : id;

  const customer = await CustomerModel.findOne({ _id: customerId, agentId: req.user!.id, deletedAt: null });
  if (!customer) throw new HttpError(404, "Customer not found");

  return sendData(res, customer);
}

export async function createCustomer(req: Request, res: Response) {
  const input = createCustomerSchema.parse(req.body);

  const existingPhone = await CustomerModel.findOne({ agentId: req.user!.id, phone: input.phone, deletedAt: null });
  if (existingPhone) throw new HttpError(409, "Phone number already exists");

  const customer = await CustomerModel.create({
    ...input,
    agentId: req.user!.id,
  });

  return sendData(res, customer, 201);
}

export async function updateCustomer(req: Request, res: Response) {
  const { id } = req.params;
  const customerId = Array.isArray(id) ? id[0] : id;
  const input = updateCustomerSchema.parse(req.body);

  const customer = await CustomerModel.findOne({ _id: customerId, agentId: req.user!.id, deletedAt: null });
  if (!customer) throw new HttpError(404, "Customer not found");

  if (input.phone && input.phone !== customer.phone) {
    const existingPhone = await CustomerModel.findOne({
      agentId: req.user!.id,
      phone: input.phone,
      deletedAt: null,
      _id: { $ne: customerId },
    });
    if (existingPhone) throw new HttpError(409, "Phone number already exists");
  }

  Object.assign(customer, input);
  await customer.save();

  return sendData(res, customer);
}

export async function deleteCustomer(req: Request, res: Response) {
  const { id } = req.params;
  const customerId = Array.isArray(id) ? id[0] : id;

  const customer = await CustomerModel.findOne({ _id: customerId, agentId: req.user!.id, deletedAt: null });
  if (!customer) throw new HttpError(404, "Customer not found");

  customer.deletedAt = new Date();
  await customer.save();

  return sendData(res, { success: true });
}
