import { z } from "zod";
import type { PstBasePriceMode, PstRequiredInput } from "@/lib/templateSchemas";

export type LeadStatus =
  | "PROSPECT"
  | "CONTACTED"
  | "SITE_VISIT"
  | "QUOTE_SENT"
  | "NEGOTIATION"
  | "WON"
  | "LOST";

export const QuoteLineSchema = z.object({
  id: z.string().min(1),
  category: z.enum(["BASE", "PROCESS", "CRATING", "THIRD_PARTY", "ADDER", "DISCOUNT"]),
  name: z.string().min(1),
  description: z.string().optional(),
  qty: z.number().min(0),
  unit: z.string().optional(),
  unitPrice: z.number().min(0),
  total: z.number().min(0),
  meta: z.record(z.string(), z.any()).optional(),
});
export type QuoteLine = z.infer<typeof QuoteLineSchema>;

export const QuoteSchema = z.object({
  id: z.string().min(1),
  leadId: z.string().min(1),
  proposalNumber: z.string().min(1),
  customerId: z.string().optional(),
  customerLegalName: z.string().optional(),
  customerTaxId: z.string().optional(),
  customerAddress: z.string().optional(),
  serviceOriginAddress: z.string().optional(),
  serviceDestinationAddress: z.string().optional(),
  billingLegalName: z.string().optional(),
  billingTaxId: z.string().optional(),
  billingAddress: z.string().optional(),
  billingEmail: z.string().optional(),
  billingPhone: z.string().optional(),
  pstCode: z.string().optional(),
  pstServiceName: z.string().optional(),
  pstVersionLocked: z.number().optional(),
  pstLinkedPgdTemplateCode: z.string().optional(),
  pstDefaultNestingAllowed: z.boolean().optional(),
  pstPriceMode: z.string().optional(),
  pstPriceCurrency: z.string().optional(),
  pstBaseRate: z.number().optional(),
  pstMinimumCharge: z.number().optional(),
  pstMaxDiscountPctWithoutApproval: z.number().optional(),
  pstMinMarginPct: z.number().optional(),
  pstRequiredInputs: z.array(z.string()).default([]),
  pstInputValues: z.record(z.string(), z.string()).default({}),
  pstNotes: z.string().optional(),
  title: z.string().min(1),
  currency: z.literal("RD$").default("RD$"),
  notes: z.string().optional(),
  inclusions: z.array(z.string()).default([]),
  exclusions: z.array(z.string()).default([]),
  permits: z.array(z.string()).default([]),
  contractClauses: z.array(z.string()).default([]),
  resourcePlan: z
    .object({
      plannedDays: z.number().min(0).default(0),
      plannedTrucks: z.number().min(0).default(0),
      plannedPeople: z.number().min(0).default(0),
    })
    .default({ plannedDays: 0, plannedTrucks: 0, plannedPeople: 0 }),
  crateDraftId: z.string().optional(),
  crateSnapshot: z.any().optional(),
  lines: z.array(QuoteLineSchema).default([]),
  totals: z.object({
    subtotal: z.number().min(0),
    discount: z.number().min(0),
    total: z.number().min(0),
  }),
  updatedAt: z.string().min(1),
});
export type Quote = z.infer<typeof QuoteSchema>;

export type QuoteWithPst = Quote & {
  pstCode?: string;
  pstServiceName?: string;
  pstVersionLocked?: number;
  pstLinkedPgdTemplateCode?: string;
  pstDefaultNestingAllowed?: boolean;
  pstPriceMode?: PstBasePriceMode;
  pstPriceCurrency?: "RD$" | "USD";
  pstBaseRate?: number;
  pstMinimumCharge?: number;
  pstMaxDiscountPctWithoutApproval?: number;
  pstMinMarginPct?: number;
  pstRequiredInputs?: PstRequiredInput[];
  pstInputValues?: Record<string, string>;
  pstNotes?: string;
};

export type LeadLite = {
  id: string;
  customerId?: string;
  clientName: string;
  status: LeadStatus;
  serviceType?: string;
  pstCode?: string;
  origin?: string;
  destination?: string;
  phone?: string;
  email?: string;
  createdAt?: string;
  updatedAt?: string;
};
