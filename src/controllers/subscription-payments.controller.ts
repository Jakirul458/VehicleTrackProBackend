import type { Request, Response } from "express";
import { z } from "zod";
import { PlatformSettingsModel } from "../models/PlatformSettings.js";
import { SubscriptionPaymentModel } from "../models/SubscriptionPayment.js";
import { SubscriptionPlanModel } from "../models/SubscriptionPlan.js";
import { UserModel } from "../models/User.js";
import { HttpError, sendData } from "../utils/http.js";

const paymentSchema = z.object({
  planId: z.string().regex(/^[a-f\d]{24}$/i),
  utr: z
    .string()
    .trim()
    .regex(/^\d{12}$/, "Enter the 12-digit UTR/transaction ID."),
  paymentApp: z.string().trim().min(2).max(40),
  paymentDate: z.string().date(),
  screenshot: z
    .string()
    .max(700_000)
    .regex(/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/)
    .optional()
    .default(""),
});

const reviewSchema = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("APPROVED"),
    gstEnabled: z.boolean().optional(),
    gstRate: z.number().min(0).max(100).optional(),
    sellerGstin: z.string().trim().max(20).optional(),
  }),
  z.object({
    status: z.literal("REJECTED"),
    rejectReason: z.string().trim().max(500).default(""),
  }),
]);
const invoicePartyEditSchema = z
  .object({
    fullName: z.string().trim().max(120),
    businessName: z.string().trim().max(160),
    email: z
      .string()
      .trim()
      .max(254)
      .refine(
        (value) => value === "" || z.string().email().safeParse(value).success,
        "Enter a valid email address.",
      ),
    mobile: z.string().trim().max(30),
    address: z.string().trim().max(300),
    city: z.string().trim().max(100),
    state: z.string().trim().max(100),
    pinCode: z.string().trim().max(20),
    gstin: z.string().trim().max(20),
  })
  .partial();
const invoiceEditSchema = z
  .object({
    invoiceNumber: z.string().trim().min(1).max(50),
    planName: z.string().trim().min(1).max(120),
    planDescription: z.string().trim().max(500),
    paymentDate: z.string().date(),
    authorizedSignatory: z.string().trim().max(120),
    customer: invoicePartyEditSchema,
    seller: invoicePartyEditSchema,
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: "Provide at least one invoice field to update.",
  });
const invoiceOptionsSchema = z.object({
  gstEnabled: z.boolean().default(false),
  gstRate: z.number().min(0).max(100).default(18),
  sellerGstin: z.string().trim().max(20).optional(),
});
const idSchema = z
  .string()
  .regex(/^[a-f\d]{24}$/i, "Invalid subscription payment ID.");
const paymentStatusSchema = z.enum([
  "PENDING",
  "APPROVED",
  "REJECTED",
  "VOIDED",
]);

function partySnapshot(
  party: {
    fullName?: string | null | undefined;
    businessName?: string | null | undefined;
    email?: string | null | undefined;
    mobile?: string | null | undefined;
    address?: string | null | undefined;
    city?: string | null | undefined;
    state?: string | null | undefined;
    pinCode?: string | null | undefined;
    gstin?: string | null | undefined;
    signatureImage?: string | null | undefined;
  } | null,
) {
  return {
    fullName: party?.fullName ?? "",
    businessName: party?.businessName ?? "",
    email: party?.email ?? "",
    mobile: party?.mobile ?? "",
    address: party?.address ?? "",
    city: party?.city ?? "",
    state: party?.state ?? "",
    pinCode: party?.pinCode ?? "",
    gstin: party?.gstin ?? "",
    signatureImage: party?.signatureImage ?? "",
  };
}

function invoiceAmounts(amount: number, gstEnabled: boolean, gstRate: number) {
  const gstAmount = gstEnabled
    ? Math.round(amount * (gstRate / 100) * 100) / 100
    : 0;
  return {
    gstEnabled,
    gstRate: gstEnabled ? gstRate : 0,
    gstAmount,
    totalAmount: Math.round((amount + gstAmount) * 100) / 100,
  };
}

function validateGstin(gstin: string) {
  return /^[0-9A-Z]{15}$/.test(gstin);
}

function indiaDateString(date: Date) {
  return new Date(date.getTime() + 330 * 60 * 1000).toISOString().slice(0, 10);
}

async function invoiceResponse(invoice: {
  toJSON: () => unknown;
  seller: Record<string, unknown> & { signatureImage?: string };
  screenshot?: string;
}, includeScreenshot = false) {
  const [resultValue, settings] = await Promise.all([
    Promise.resolve(invoice.toJSON()),
    PlatformSettingsModel.findOne({ key: "platform" }),
  ]);
  const result = resultValue as Record<string, unknown>;
  const seller = result["seller"];
  if (seller && typeof seller === "object") {
    const sellerSnapshot = seller as Record<string, unknown>;
    const businessName =
      sellerSnapshot["businessName"] || settings?.businessName || "VehicleTrack Pro";
    sellerSnapshot["businessName"] = businessName;
    sellerSnapshot["fullName"] =
      sellerSnapshot["fullName"] || businessName || "VehicleTrack Pro";
    sellerSnapshot["address"] ||= settings?.businessAddress ?? "";
    sellerSnapshot["email"] ||= settings?.supportEmail ?? "";
    sellerSnapshot["mobile"] ||= settings?.supportWhatsapp ?? "";
    sellerSnapshot["gstin"] ||= settings?.businessGstin ?? "";
    sellerSnapshot["signatureImage"] =
      invoice.seller.signatureImage || settings?.invoiceSignatureImage || "";
  }
  result["authorizedSignatory"] ||=
    settings?.invoiceAuthorizedSignatory ?? "";
  const gstRate = Number(result["gstRate"] ?? 0);
  if (!result["gstEnabled"] || gstRate <= 0) {
    result["gstEnabled"] = false;
    result["gstRate"] = 0;
    result["gstAmount"] = 0;
    result["totalAmount"] = Number(result["amount"] ?? 0);
  }
  if (includeScreenshot && invoice.screenshot) {
    result["screenshot"] = invoice.screenshot;
  }
  return result;
}

export async function submitSubscriptionPayment(req: Request, res: Response) {
  if (!req.user || req.user.role !== "AGENT") {
    throw new HttpError(
      403,
      "An agent account is required to submit subscription payment.",
    );
  }
  const input = paymentSchema.parse(req.body);
  const [plan, agent, settings] = await Promise.all([
    SubscriptionPlanModel.findById(input.planId),
    UserModel.findById(req.user.id).select(
      "fullName businessName email mobile address city state pinCode",
    ),
    PlatformSettingsModel.findOne({ key: "platform" }),
  ]);
  if (!plan)
    throw new HttpError(404, "This subscription plan is no longer available.");
  if (
    settings?.invoiceGstEnabled &&
    !validateGstin(settings.businessGstin.trim().toUpperCase())
  ) {
    throw new HttpError(
      422,
      "Subscription checkout is unavailable until a valid supplier GSTIN is configured.",
    );
  }
  if (plan.current_price < 1) {
    throw new HttpError(
      422,
      "A zero-price plan does not require a payment submission.",
    );
  }
  if (!agent) throw new HttpError(404, "Agent account not found.");
  const existingPending = await SubscriptionPaymentModel.exists({
    agentId: agent._id,
    status: "PENDING",
  });
  if (existingPending) {
    throw new HttpError(
      409,
      "You already have a payment awaiting verification. Contact support if you need help.",
    );
  }

  const submission = await SubscriptionPaymentModel.create({
    agentId: agent._id,
    planId: plan._id,
    planName: plan.name,
    planDescription: plan.description,
    amount: plan.current_price,
    ...invoiceAmounts(
      plan.current_price,
      settings?.invoiceGstEnabled ?? false,
      settings?.invoiceGstRate ?? 18,
    ),
    utr: input.utr,
    paymentApp: input.paymentApp,
    paymentDate: new Date(`${input.paymentDate}T00:00:00.000Z`),
    screenshot: input.screenshot,
    customer: partySnapshot(agent),
    seller: partySnapshot({
      fullName: settings?.businessName || "VehicleTrack Pro",
      businessName: settings?.businessName || "VehicleTrack Pro",
      address: settings?.businessAddress,
      email: settings?.supportEmail,
      mobile: settings?.supportWhatsapp,
      gstin: settings?.businessGstin,
      signatureImage: settings?.invoiceSignatureImage,
    }),
  });
  await UserModel.updateOne(
    { _id: agent._id },
    {
      $set: {
        subscriptionStatus: "PENDING",
        subscriptionPlanName: plan.name,
      },
    },
  );
  return sendData(res, submission, 201);
}

export async function listMySubscriptionPayments(req: Request, res: Response) {
  if (!req.user)
    throw new HttpError(
      401,
      "Please sign in to view your subscription payments.",
    );
  const submissions = await SubscriptionPaymentModel.find({
    agentId: req.user.id,
  })
    .sort({ createdAt: -1 })
    .limit(50);
  return sendData(res, submissions);
}

export async function getMyInvoice(req: Request, res: Response) {
  const id = idSchema.parse(req.params["id"]);
  const filter: Record<string, unknown> = {
    _id: id,
    status: "APPROVED",
  };
  if (req.user?.role !== "SUPER_ADMIN") filter.agentId = req.user?.id;
  const invoice = await SubscriptionPaymentModel.findOne(filter);
  if (!invoice)
    throw new HttpError(
      404,
      "The approved subscription invoice was not found.",
    );
  return sendData(res, await invoiceResponse(invoice));
}

export async function updateSubscriptionInvoice(req: Request, res: Response) {
  const id = idSchema.parse(req.params["id"]);
  const input = invoiceEditSchema.parse(req.body);
  const filter: Record<string, unknown> = { _id: id, status: "APPROVED" };
  if (req.user?.role !== "SUPER_ADMIN") filter.agentId = req.user?.id;

  const invoice = await SubscriptionPaymentModel.findOne(filter);
  if (!invoice) {
    throw new HttpError(404, "The approved subscription invoice was not found.");
  }
  if (input.paymentDate && input.paymentDate > indiaDateString(new Date())) {
    throw new HttpError(422, "Payment date cannot be in the future.");
  }

  if (
    input.invoiceNumber &&
    input.invoiceNumber !== invoice.invoiceNumber &&
    (await SubscriptionPaymentModel.exists({
      invoiceNumber: input.invoiceNumber,
      _id: { $ne: invoice._id },
    }))
  ) {
    throw new HttpError(409, "That invoice number is already in use.");
  }

  if (input.invoiceNumber !== undefined)
    invoice.invoiceNumber = input.invoiceNumber;
  if (input.planName !== undefined) invoice.planName = input.planName;
  if (input.planDescription !== undefined)
    invoice.planDescription = input.planDescription;
  if (input.paymentDate !== undefined)
    invoice.paymentDate = new Date(`${input.paymentDate}T00:00:00.000Z`);
  if (input.authorizedSignatory !== undefined)
    invoice.authorizedSignatory = input.authorizedSignatory;
  if (input.customer) {
    for (const [key, value] of Object.entries(input.customer)) {
      if (value !== undefined) invoice.set(`customer.${key}`, value);
    }
  }
  if (input.seller) {
    for (const [key, value] of Object.entries(input.seller)) {
      if (value !== undefined) invoice.set(`seller.${key}`, value);
    }
    if (input.seller.gstin !== undefined && input.seller.gstin !== "") {
      invoice.seller.gstin = input.seller.gstin.toUpperCase();
    }
  }

  await invoice.save();
  return sendData(res, await invoiceResponse(invoice));
}

export async function voidSubscriptionInvoice(req: Request, res: Response) {
  const id = idSchema.parse(req.params["id"]);
  const filter: Record<string, unknown> = { _id: id, status: "APPROVED" };
  if (req.user?.role !== "SUPER_ADMIN") filter.agentId = req.user?.id;
  const invoice = await SubscriptionPaymentModel.findOneAndUpdate(
    filter,
    {
      $set: {
        status: "VOIDED",
        voidedAt: new Date(),
        ...(req.user?.id ? { voidedBy: req.user.id } : {}),
      },
    },
    { new: true, runValidators: true },
  );
  if (!invoice) {
    throw new HttpError(404, "The approved subscription invoice was not found.");
  }
  return sendData(res, { id: String(invoice._id) });
}

export async function listSubscriptionPayments(req: Request, res: Response) {
  const page = Math.max(1, Number(req.query["page"]) || 1);
  const limit = Math.min(50, Math.max(10, Number(req.query["limit"]) || 20));
  const status = req.query["status"]
    ? paymentStatusSchema.parse(req.query["status"])
    : undefined;
  const filter = status ? { status } : {};
  const [submissions, total] = await Promise.all([
    SubscriptionPaymentModel.find(filter)
      .populate("agentId", "fullName email mobile businessName")
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    SubscriptionPaymentModel.countDocuments(filter),
  ]);
  return sendData(res, {
    data: submissions,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  });
}

export async function getSubscriptionPayment(req: Request, res: Response) {
  const id = idSchema.parse(req.params["id"]);
  const submission = await SubscriptionPaymentModel.findById(id).populate(
    "agentId",
    "fullName email mobile businessName",
  );
  if (!submission) throw new HttpError(404, "Subscription payment not found.");
  return sendData(res, await invoiceResponse(submission, true));
}

export async function reviewSubscriptionPayment(req: Request, res: Response) {
  const id = idSchema.parse(req.params["id"]);
  const input = reviewSchema.parse(req.body);
  const submission = await SubscriptionPaymentModel.findById(id);
  if (!submission) throw new HttpError(404, "Subscription payment not found.");
  if (submission.status !== "PENDING") {
    throw new HttpError(
      409,
      "This payment submission has already been reviewed.",
    );
  }

  if (input.status === "REJECTED") {
    const updated = await SubscriptionPaymentModel.findOneAndUpdate(
      { _id: submission._id, status: "PENDING" },
      { $set: { status: "REJECTED", rejectReason: input.rejectReason } },
      { new: true },
    );
    if (!updated)
      throw new HttpError(
        409,
        "This payment submission has already been reviewed.",
      );
    await UserModel.updateOne(
      { _id: submission.agentId, subscriptionStatus: "PENDING" },
      { $set: { subscriptionStatus: "REJECTED" } },
    );
    return sendData(res, updated);
  }

  const agent = await UserModel.findById(submission.agentId);
  if (!agent)
    throw new HttpError(
      404,
      "The agent account for this payment no longer exists.",
    );

  const now = new Date();
  const currentEnd = agent.trialEndDate;
  const periodStart =
    currentEnd && currentEnd.getTime() > now.getTime() ? currentEnd : now;
  const periodEnd = new Date(periodStart);
  const nextYear = periodEnd.getFullYear() + 1;
  const month = periodEnd.getMonth();
  const day = periodEnd.getDate();
  periodEnd.setFullYear(nextYear, month, 1);
  periodEnd.setDate(Math.min(day, new Date(nextYear, month + 1, 0).getDate()));
  const issuedAt = now;
  const invoiceNumber = `VTP-${issuedAt.toISOString().slice(0, 10).replace(/-/g, "")}-${String(submission._id).slice(-6).toUpperCase()}`;
  const settings = await PlatformSettingsModel.findOne({ key: "platform" });
  if (input.status !== "APPROVED") {
    throw new HttpError(400, "Invalid payment review action.");
  }
  const gstEnabled = input.gstEnabled ?? submission.gstEnabled;
  const gstRate = input.gstRate ?? submission.gstRate;
  const tax = invoiceAmounts(submission.amount, gstEnabled, gstRate);
  const expectedPaidAmount = submission.totalAmount || submission.amount;
  if (tax.totalAmount !== expectedPaidAmount) {
    throw new HttpError(
      422,
      "The invoice tax selection does not match the amount quoted for payment.",
    );
  }
  const sellerGstin =
    input.sellerGstin?.trim().toUpperCase() ??
    settings?.businessGstin ??
    submission.seller.gstin;
  if (gstEnabled && !validateGstin(sellerGstin)) {
    throw new HttpError(422, "Enter a valid 15-character supplier GSTIN.");
  }
  submission.seller.gstin = sellerGstin;
  submission.seller.signatureImage = settings?.invoiceSignatureImage ?? "";

  const approvedSubmission = await SubscriptionPaymentModel.findOneAndUpdate(
    { _id: submission._id, status: "PENDING" },
    {
      $set: {
        status: "APPROVED",
        invoiceNumber,
        approvedAt: issuedAt,
        periodStart,
        periodEnd,
        ...tax,
        authorizedSignatory: settings?.invoiceAuthorizedSignatory ?? "",
        seller: submission.seller,
      },
    },
    { new: true, runValidators: true },
  );
  if (!approvedSubmission) {
    throw new HttpError(
      409,
      "This payment submission has already been reviewed.",
    );
  }

  try {
    agent.trialEndDate = periodEnd;
    agent.subscriptionStatus = "PAID";
    agent.subscriptionPlanName = submission.planName;
    await agent.save();
  } catch (error) {
    await SubscriptionPaymentModel.updateOne(
      { _id: approvedSubmission._id, status: "APPROVED", invoiceNumber },
      {
        $set: { status: "PENDING", invoiceNumber: "", approvedAt: null },
        $unset: { periodStart: "", periodEnd: "" },
      },
    );
    throw error;
  }
  return sendData(res, approvedSubmission);
}

export async function listAgentSubscriptions(req: Request, res: Response) {
  const page = Math.max(1, Number(req.query["page"]) || 1);
  const limit = Math.min(50, Math.max(10, Number(req.query["limit"]) || 20));
  const skip = (page - 1) * limit;
  const search =
    typeof req.query["search"] === "string" ? req.query["search"].trim() : "";
  const filter: Record<string, unknown> = { role: "AGENT" };
  if (search) {
    filter.$or = [
      { fullName: { $regex: search, $options: "i" } },
      { email: { $regex: search, $options: "i" } },
      { mobile: { $regex: search, $options: "i" } },
      { businessName: { $regex: search, $options: "i" } },
    ];
  }
  const [agents, total] = await Promise.all([
    UserModel.find(filter)
      .select(
        "fullName businessName email mobile status subscriptionStatus subscriptionPlanName trialEndDate",
      )
      .sort({ createdAt: -1, _id: -1 })
      .skip(skip)
      .limit(limit),
    UserModel.countDocuments(filter),
  ]);
  const agentIds = agents.map((agent) => agent._id);
  const latestPayments = agentIds.length
    ? await SubscriptionPaymentModel.aggregate<{
        _id: string;
        latest: Record<string, unknown>;
      }>([
        { $match: { agentId: { $in: agentIds } } },
        { $sort: { createdAt: -1, _id: -1 } },
        { $group: { _id: "$agentId", latest: { $first: "$$ROOT" } } },
        {
          $project: {
            "latest.screenshot": 0,
            "latest.customer": 0,
            "latest.seller": 0,
            "latest.__v": 0,
          },
        },
      ])
    : [];
  const paymentByAgent = new Map(
    latestPayments.map(({ _id, latest }) => [String(_id), latest]),
  );
  return sendData(res, {
    data: agents.map((agent) => ({
      ...agent.toJSON(),
      latestPayment: (() => {
        const payment = paymentByAgent.get(String(agent._id));
        if (!payment) return null;
        return {
          id: String(payment["_id"]),
          planName: payment["planName"],
          amount: payment["amount"],
          totalAmount: payment["totalAmount"] || payment["amount"],
          gstEnabled: payment["gstEnabled"] ?? false,
          gstAmount: payment["gstAmount"] ?? 0,
          utr: payment["utr"],
          paymentApp: payment["paymentApp"],
          paymentDate: payment["paymentDate"],
          status: payment["status"],
          invoiceNumber: payment["invoiceNumber"],
          rejectReason: payment["rejectReason"],
          createdAt: payment["createdAt"],
        };
      })(),
    })),
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  });
}

export async function setAgentSubscription(req: Request, res: Response) {
  const id = idSchema.parse(req.params["id"]);
  const input = z
    .object({
      status: z.literal("FREE"),
      trialEndDate: z.string().date(),
    })
    .parse(req.body);
  const agent = await UserModel.findOne({ _id: id, role: "AGENT" });
  if (!agent) throw new HttpError(404, "Agent not found.");
  const nextDate = new Date(`${input.trialEndDate}T23:59:59.999Z`);
  agent.subscriptionStatus = input.status;
  agent.subscriptionPlanName = "Free access";
  agent.trialEndDate = nextDate;
  await agent.save();
  return sendData(res, agent);
}

export async function issueAgentSubscriptionInvoice(
  req: Request,
  res: Response,
) {
  const id = idSchema.parse(req.params["id"]);
  const input = z
    .object({
      planId: idSchema,
      trialEndDate: z.string().date(),
      paymentDate: z.string().date(),
      ...invoiceOptionsSchema.shape,
    })
    .parse(req.body);
  const [agent, plan, settings] = await Promise.all([
    UserModel.findOne({ _id: id, role: "AGENT" }).select(
      "fullName businessName email mobile address city state pinCode trialEndDate",
    ),
    SubscriptionPlanModel.findById(input.planId),
    PlatformSettingsModel.findOne({ key: "platform" }),
  ]);
  if (!agent) throw new HttpError(404, "Agent not found.");
  if (!plan) throw new HttpError(404, "Subscription plan not found.");
  if (plan.current_price < 1) {
    throw new HttpError(
      422,
      "A free plan cannot generate a paid subscription invoice.",
    );
  }
  const pendingPayment = await SubscriptionPaymentModel.exists({
    agentId: agent._id,
    status: "PENDING",
  });
  if (pendingPayment) {
    throw new HttpError(
      409,
      "Review or reject the agent's pending UPI submission before issuing a manual invoice.",
    );
  }
  const sellerGstin =
    input.sellerGstin?.trim().toUpperCase() ?? settings?.businessGstin ?? "";
  if (input.gstEnabled && !validateGstin(sellerGstin)) {
    throw new HttpError(422, "Enter a valid 15-character supplier GSTIN.");
  }

  const issuedAt = new Date();
  if (input.paymentDate > indiaDateString(issuedAt)) {
    throw new HttpError(422, "Payment date cannot be in the future.");
  }
  const paymentDate = new Date(`${input.paymentDate}T00:00:00.000Z`);
  const periodEnd = new Date(`${input.trialEndDate}T23:59:59.999Z`);
  if (periodEnd.getTime() < issuedAt.getTime()) {
    throw new HttpError(422, "Validity date must be today or a future date.");
  }
  const periodStart = issuedAt;
  const tax = invoiceAmounts(
    plan.current_price,
    input.gstEnabled,
    input.gstRate,
  );
  const invoice = new SubscriptionPaymentModel({
    agentId: agent._id,
    planId: plan._id,
    planName: plan.name,
    planDescription: plan.description,
    amount: plan.current_price,
    utr: "",
    paymentApp: "Admin verified",
    paymentDate,
    customer: partySnapshot(agent),
    seller: partySnapshot({
      fullName: settings?.businessName || "VehicleTrack Pro",
      businessName: settings?.businessName || "VehicleTrack Pro",
      address: settings?.businessAddress,
      email: settings?.supportEmail,
      mobile: settings?.supportWhatsapp,
      gstin: settings?.businessGstin,
      signatureImage: settings?.invoiceSignatureImage,
    }),
    status: "APPROVED",
    invoiceNumber: "",
    approvedAt: issuedAt,
    periodStart,
    periodEnd,
    ...tax,
    authorizedSignatory: settings?.invoiceAuthorizedSignatory ?? "",
  });
  invoice.seller.gstin = sellerGstin;
  invoice.utr = `ADMIN-${invoice.id}`;
  invoice.invoiceNumber = `VTP-${issuedAt.toISOString().slice(0, 10).replace(/-/g, "")}-${String(invoice._id).slice(-6).toUpperCase()}`;

  try {
    await invoice.save();
    const updatedAgent = await UserModel.updateOne(
      { _id: agent._id },
      {
        $set: {
          subscriptionStatus: "PAID",
          subscriptionPlanName: plan.name,
          trialEndDate: periodEnd,
        },
      },
    );
    if (!updatedAgent.matchedCount) {
      throw new HttpError(404, "Agent not found.");
    }
  } catch (error) {
    await SubscriptionPaymentModel.deleteOne({ _id: invoice._id });
    throw error;
  }

  return sendData(res, invoice);
}
