export type CommercialProjectStatus = "ACTIVE" | "CLOSED";

export type CommercialProject = {
  id: string;
  projectNumber: string;
  customerId?: string;
  customerName: string;
  leadId?: string;
  quoteId?: string;
  pstCode?: string;
  pstServiceName?: string;
  status: CommercialProjectStatus;
  createdAt: string;
  updatedAt: string;
};
