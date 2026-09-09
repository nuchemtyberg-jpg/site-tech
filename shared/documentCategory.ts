export const DEFAULT_DOCUMENT_CATEGORIES = [
  { key: "rfp", name: "RFP" },
  { key: "plans", name: "Plans" },
  { key: "specifications", name: "Specifications" },
  { key: "addenda", name: "Addenda" },
  { key: "geotechnical", name: "Geotechnical" },
  { key: "civil", name: "Civil" },
  { key: "architectural", name: "Architectural" },
  { key: "structural", name: "Structural" },
  { key: "bid_forms", name: "Bid Forms" },
  { key: "vendor_quote", name: "Vendor Quote" },
  { key: "correspondence", name: "Correspondence" },
  { key: "other", name: "Other" },
] as const;

export const DOCUMENT_CATEGORY_VALUES = DEFAULT_DOCUMENT_CATEGORIES.map(category => category.key) as [
  (typeof DEFAULT_DOCUMENT_CATEGORIES)[number]["key"],
  ...(typeof DEFAULT_DOCUMENT_CATEGORIES)[number]["key"][],
];

export type DocumentCategory = (typeof DOCUMENT_CATEGORY_VALUES)[number];

export const DOCUMENT_CATEGORY_LABELS = Object.fromEntries(
  DEFAULT_DOCUMENT_CATEGORIES.map(category => [category.key, category.name]),
) as Record<DocumentCategory, string>;

export function getDocumentCategoryLabel(category: string | null | undefined): string {
  if (!category) return "Uncategorized";
  return DOCUMENT_CATEGORY_LABELS[category as DocumentCategory] || category;
}

export const DOCUMENT_STATUS_VALUES = ["current", "superseded"] as const;
export type DocumentStatus = (typeof DOCUMENT_STATUS_VALUES)[number];
