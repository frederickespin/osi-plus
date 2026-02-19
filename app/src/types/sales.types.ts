import { z } from "zod";

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
  title: z.string().min(1),
  currency: z.string().min(1).default("RD$"),
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

export type LeadLite = {
  id: string;
  customerId?: string;
  clientName: string;
  status: LeadStatus;
  origin?: string;
  destination?: string;
  phone?: string;
  email?: string;
  createdAt?: string;
  updatedAt?: string;
};
