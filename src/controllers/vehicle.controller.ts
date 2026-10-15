import type { Request, Response } from "express";
import { z } from "zod";
import { VehicleModel } from "../models/Vehicle.js";
import { CustomerModel } from "../models/Customer.js";
import { HttpError, sendData } from "../utils/http.js";

const createVehicleSchema = z.object({
  customerId: z.string(),
  registrationNumber: z.string().trim().min(1).max(20),
  vehicleType: z.enum(["CAR", "MOTORCYCLE", "COMMERCIAL", "THREE_WHEELER", "OTHER"]),
  vehicleMake: z.string().trim().min(1).max(100),
  vehicleModel: z.string().trim().min(1).max(100),
  vehicleVariant: z.string().trim().max(100).optional(),
  manufacturingYear: z.number().int().min(1900).max(new Date().getFullYear() + 1),
  fuelType: z.enum(["PETROL", "DIESEL", "ELECTRIC", "CNG", "HYBRID", "OTHER"]),
  chassisNumber: z.string().trim().min(1).max(50),
  engineNumber: z.string().trim().min(1).max(50),
  ownerName: z.string().trim().min(1).max(120),
  documents: z.object({
    insuranceProvider: z.string().trim().optional(),
    insurancePolicyNumber: z.string().trim().optional(),
    insuranceStartDate: z.string().optional(),
    insuranceExpiryDate: z.string().optional(),
    roadTaxStartDate: z.string().optional(),
    roadTaxExpiryDate: z.string().optional(),
    pucNumber: z.string().trim().optional(),
    pucStartDate: z.string().optional(),
    pucExpiryDate: z.string().optional(),
    fitnessStartDate: z.string().optional(),
    fitnessExpiryDate: z.string().optional(),
    permitNumber: z.string().trim().optional(),
    permitStartDate: z.string().optional(),
    permitExpiryDate: z.string().optional(),
  }).optional(),
});

const updateVehicleSchema = z.object({
  customerId: z.string().optional(),
  registrationNumber: z.string().trim().min(1).max(20).optional(),
  vehicleType: z.enum(["CAR", "MOTORCYCLE", "COMMERCIAL", "THREE_WHEELER", "OTHER"]).optional(),
  vehicleMake: z.string().trim().min(1).max(100).optional(),
  vehicleModel: z.string().trim().min(1).max(100).optional(),
  vehicleVariant: z.string().trim().max(100).optional(),
  manufacturingYear: z.number().int().min(1900).max(new Date().getFullYear() + 1).optional(),
  fuelType: z.enum(["PETROL", "DIESEL", "ELECTRIC", "CNG", "HYBRID", "OTHER"]).optional(),
  chassisNumber: z.string().trim().min(1).max(50).optional(),
  engineNumber: z.string().trim().min(1).max(50).optional(),
  ownerName: z.string().trim().min(1).max(120).optional(),
  documents: z.object({
    insuranceProvider: z.string().trim().optional(),
    insurancePolicyNumber: z.string().trim().optional(),
    insuranceStartDate: z.string().optional(),
    insuranceExpiryDate: z.string().optional(),
    roadTaxStartDate: z.string().optional(),
    roadTaxExpiryDate: z.string().optional(),
    pucNumber: z.string().trim().optional(),
    pucStartDate: z.string().optional(),
    pucExpiryDate: z.string().optional(),
    fitnessStartDate: z.string().optional(),
    fitnessExpiryDate: z.string().optional(),
    permitNumber: z.string().trim().optional(),
    permitStartDate: z.string().optional(),
    permitExpiryDate: z.string().optional(),
  }).optional(),
});

export async function listVehicles(req: Request, res: Response) {
  const { page = 1, limit = 20, search, customerId } = req.query;
  const skip = (Number(page) - 1) * Number(limit);

  const filter: Record<string, unknown> = { agentId: req.user!.id, deletedAt: null };
  if (customerId && typeof customerId === 'string') filter.customerId = customerId;
  if (search) {
    filter.$or = [
      { registrationNumber: { $regex: search, $options: "i" } },
      { ownerName: { $regex: search, $options: "i" } },
      { vehicleMake: { $regex: search, $options: "i" } },
      { vehicleModel: { $regex: search, $options: "i" } },
    ];
  }

  const [vehicles, total] = await Promise.all([
    VehicleModel.find(filter).skip(skip).limit(Number(limit)).sort({ createdAt: -1 }).populate("customerId"),
    VehicleModel.countDocuments(filter),
  ]);

  return sendData(res, {
    data: vehicles,
    pagination: { page: Number(page), limit: Number(limit), total, pages: Math.ceil(total / Number(limit)) },
  });
}

export async function getVehicle(req: Request, res: Response) {
  const { id } = req.params;
  const vehicleId = Array.isArray(id) ? id[0] : id;

  const vehicle = await VehicleModel.findOne({ _id: vehicleId, agentId: req.user!.id, deletedAt: null }).populate("customerId");
  if (!vehicle) throw new HttpError(404, "Vehicle not found");

  return sendData(res, vehicle);
}

export async function createVehicle(req: Request, res: Response) {
  const input = createVehicleSchema.parse(req.body);

  const customer = await CustomerModel.findOne({ _id: input.customerId, agentId: req.user!.id, deletedAt: null });
  if (!customer) throw new HttpError(404, "Customer not found");

  const existingReg = await VehicleModel.findOne({
    agentId: req.user!.id,
    registrationNumber: input.registrationNumber.toUpperCase(),
    deletedAt: null,
  });
  if (existingReg) throw new HttpError(409, "Registration number already exists");

  const vehicle = await VehicleModel.create({
    ...input,
    agentId: req.user!.id,
    registrationNumber: input.registrationNumber.toUpperCase(),
  });

  return sendData(res, vehicle, 201);
}

export async function updateVehicle(req: Request, res: Response) {
  const { id } = req.params;
  const vehicleId = Array.isArray(id) ? id[0] : id;
  const input = updateVehicleSchema.parse(req.body);

  const vehicle = await VehicleModel.findOne({ _id: vehicleId, agentId: req.user!.id, deletedAt: null });
  if (!vehicle) throw new HttpError(404, "Vehicle not found");

  if (input.customerId) {
    const customer = await CustomerModel.findOne({ _id: input.customerId, agentId: req.user!.id, deletedAt: null });
    if (!customer) throw new HttpError(404, "Customer not found");
  }

  if (input.registrationNumber && input.registrationNumber.toUpperCase() !== vehicle.registrationNumber) {
    const existingReg = await VehicleModel.findOne({
      agentId: req.user!.id,
      registrationNumber: input.registrationNumber.toUpperCase(),
      deletedAt: null,
      _id: { $ne: vehicleId },
    });
    if (existingReg) throw new HttpError(409, "Registration number already exists");
  }

  Object.assign(vehicle, {
    ...input,
    registrationNumber: input.registrationNumber ? input.registrationNumber.toUpperCase() : vehicle.registrationNumber,
  });
  await vehicle.save();

  return sendData(res, vehicle);
}

export async function deleteVehicle(req: Request, res: Response) {
  const { id } = req.params;
  const vehicleId = Array.isArray(id) ? id[0] : id;

  const vehicle = await VehicleModel.findOne({ _id: vehicleId, agentId: req.user!.id, deletedAt: null });
  if (!vehicle) throw new HttpError(404, "Vehicle not found");

  vehicle.deletedAt = new Date();
  await vehicle.save();

  return sendData(res, { success: true });
}
