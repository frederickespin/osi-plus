export type CustomerStatus = "ACTIVE" | "INACTIVE";

export type Customer = {
  id: string;
  // Datos para contrato / servicio
  legalName: string;
  displayName: string;
  taxId?: string;
  phone?: string;
  email?: string;
  address?: string;
  // Direcciones del servicio
  serviceOriginAddress?: string;
  serviceDestinationAddress?: string;
  // Facturacion (puede ser distinto)
  billingLegalName?: string;
  billingTaxId?: string;
  billingAddress?: string;
  billingEmail?: string;
  billingPhone?: string;
  status: CustomerStatus;
  createdAt: string;
  updatedAt: string;
};

const KEY = "osi-plus.customers";

const nowIso = () => new Date().toISOString();
const uid = () =>
  crypto?.randomUUID ? crypto.randomUUID() : `c_${Date.now()}_${Math.random().toString(16).slice(2)}`;

export function loadCustomers(): Customer[] {
  let list: Customer[] = [];
  try {
    list = JSON.parse(localStorage.getItem(KEY) || "[]");
  } catch {
    list = [];
  }

  const migrated = list.map((c) => ({
    ...c,
    taxId: c.taxId ?? "",
    serviceOriginAddress: c.serviceOriginAddress ?? c.address ?? "",
    serviceDestinationAddress: c.serviceDestinationAddress ?? "",
    billingLegalName: c.billingLegalName ?? (c as any).billingName ?? c.legalName,
    billingTaxId: c.billingTaxId ?? c.taxId ?? "",
    billingAddress: c.billingAddress ?? c.address ?? "",
    billingEmail: c.billingEmail ?? c.email ?? "",
    billingPhone: c.billingPhone ?? c.phone ?? "",
  }));

  if (JSON.stringify(migrated) !== JSON.stringify(list)) {
    localStorage.setItem(KEY, JSON.stringify(migrated));
  }

  return migrated;
}

export function saveCustomers(list: Customer[]) {
  localStorage.setItem(KEY, JSON.stringify(list));
}

export function createCustomer(input: Omit<Customer, "id" | "createdAt" | "updatedAt">) {
  const list = loadCustomers();
  const c: Customer = { ...input, id: uid(), createdAt: nowIso(), updatedAt: nowIso() };
  saveCustomers([c, ...list]);
  return c;
}

export function upsertCustomer(c: Customer) {
  const list = loadCustomers();
  const next = { ...c, updatedAt: nowIso() };
  saveCustomers([next, ...list.filter((x) => x.id !== c.id)]);
  return next;
}
