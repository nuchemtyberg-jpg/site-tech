// Fixed initial category list for Opportunity (and future) documents.
// Admin-managed/configurable categories are out of scope for now — if that
// lands later, this is the single place to swap a static list for a DB-backed
// one without touching callers (they all import DOCUMENT_CATEGORY_VALUES /
// DOCUMENT_CATEGORY_LABELS from here).
export const DOCUMENT_CATEGORY_VALUES = [
  "rfp",
  "plans",
  "specifications",
  "addenda",
  "geotechnical",
  "civil",
  "architectural",
  "structural",
  "bid_forms",
  "vendor_quote",
  "correspondence",
  "other",
] as const;

export type DocumentCategory = (typeof DOCUMENT_CATEGORY_VALUES)[number];

export const DOCUMENT_CATEGORY_LABELS: Record<DocumentCategory, string> = {
  rfp: "RFP",
  plans: "Plans",
  specifications: "Specifications",
  addenda: "Addenda",
  geotechnical: "Geotechnical",
  civil: "Civil",
  architectural: "Architectural",
  structural: "Structural",
  bid_forms: "Bid Forms",
  vendor_quote: "Vendor Quote",
  correspondence: "Correspondence",
  other: "Other",
};

export function getDocumentCategoryLabel(category: string | null | undefined): string {
  if (!category) return "Uncategorized";
  return DOCUMENT_CATEGORY_LABELS[category as DocumentCategory] || category;
}

export const DOCUMENT_STATUS_VALUES = ["current", "superseded"] as const;
export type DocumentStatus = (typeof DOCUMENT_STATUS_VALUES)[number];
