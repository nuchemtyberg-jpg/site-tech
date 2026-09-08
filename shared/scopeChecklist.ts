// Opportunity Scope Checklist — starter category/item source (Phase 4b: the
// first link in Scope → Takeoff → Estimate → Proposal). This is the single
// maintainable place for the starter category/item list, mirroring the
// documentCategory.ts pattern: a static seed source now, swappable for a
// DB-backed admin UI later without touching seed/consumer code.
//
// `key` values are stable identifiers — they are used as the seed's natural
// key (see server/dataMigrations.ts) and must never be renamed once shipped;
// add new items/categories instead of editing existing keys.

export type ScopeItemSeed = { key: string; name: string; description?: string; displayOrder: number };
export type ScopeCategorySeed = { key: string; name: string; displayOrder: number; items: ScopeItemSeed[] };

export const SCOPE_CATEGORY_SEEDS: ScopeCategorySeed[] = [
  {
    key: "sitework", name: "Sitework", displayOrder: 10,
    items: [
      { key: "clearing_grubbing", name: "Clearing & grubbing", displayOrder: 10 },
      { key: "erosion_control", name: "Erosion & sediment control", displayOrder: 20 },
      { key: "stripping", name: "Topsoil stripping & stockpiling", displayOrder: 30 },
      { key: "excavation", name: "Mass / site excavation", displayOrder: 40 },
      { key: "sitework_backfill", name: "Backfill", description: "General site backfill outside the foundation zone (utility trenches, over-excavation, retaining areas).", displayOrder: 50 },
      { key: "export_trucking", name: "Export / off-site trucking", displayOrder: 60 },
      { key: "site_grading", name: "Rough grading", displayOrder: 70 },
      { key: "fine_grading_sitework", name: "Fine grading", description: "Final surface grading to subgrade tolerance ahead of paving, landscaping, or slabs.", displayOrder: 80 },
      { key: "temp_access_roads", name: "Temporary access roads", displayOrder: 90 },
    ],
  },
  {
    key: "demolition", name: "Demolition", displayOrder: 20,
    items: [
      { key: "building_demo", name: "Building demolition", displayOrder: 10 },
      { key: "foundation_demo", name: "Foundation / slab demolition", displayOrder: 20 },
      { key: "concrete_demo", name: "Concrete demolition", description: "Concrete pavement, curb, sidewalk, and flatwork removal.", displayOrder: 30 },
      { key: "asphalt_demo", name: "Asphalt demolition", description: "Asphalt pavement removal and disposal.", displayOrder: 40 },
      { key: "utility_abandonment", name: "Utility abandonment / removal", displayOrder: 50 },
      { key: "demo_debris_removal", name: "Debris removal & disposal", displayOrder: 60 },
    ],
  },
  {
    key: "foundation", name: "Foundation", displayOrder: 30,
    items: [
      { key: "excavation_footings", name: "Excavation for footings / foundations", displayOrder: 10 },
      { key: "structural_fill", name: "Structural fill & compaction", displayOrder: 20 },
      { key: "foundation_stone_subbase", name: "Foundation stone / subbase", description: "Crushed stone or subbase course placed and compacted beneath footings and slabs.", displayOrder: 30 },
      { key: "backfill", name: "Foundation backfill", description: "Backfill directly against foundation walls and footings after forms are stripped.", displayOrder: 40 },
      { key: "fine_grading_foundation", name: "Fine grading at foundations", displayOrder: 50 },
      { key: "foundation_drainage", name: "Foundation drainage", displayOrder: 60 },
    ],
  },
  {
    key: "utilities", name: "Utilities", displayOrder: 40,
    items: [
      { key: "sanitary_sewer", name: "Sanitary sewer", displayOrder: 10 },
      { key: "storm_drainage", name: "Storm drainage", displayOrder: 20 },
      { key: "water_service", name: "Domestic / fire water service", displayOrder: 30 },
      { key: "gas_service", name: "Gas service", description: "Gas main/service coordination and trenching for the utility provider's installation.", displayOrder: 40 },
      { key: "electric_service", name: "Electric service", description: "Electric primary/service coordination and trenching for the utility provider's installation.", displayOrder: 50 },
      { key: "drywell", name: "Drywell / recharge system", displayOrder: 60 },
      { key: "utility_trenching", name: "Utility trenching & bedding", displayOrder: 70 },
      { key: "utility_relocations", name: "Utility relocations", displayOrder: 80 },
    ],
  },
  {
    key: "soe_foundation_support", name: "SOE/Foundation Support", displayOrder: 50,
    items: [
      { key: "sheeting_shoring", name: "Sheeting & shoring", displayOrder: 10 },
      { key: "soldier_piles", name: "Soldier piles", displayOrder: 20 },
      { key: "lagging", name: "Lagging", displayOrder: 30 },
      { key: "tiebacks", name: "Tiebacks", displayOrder: 40 },
      { key: "micropiles", name: "Micropiles", displayOrder: 50 },
      { key: "secant_piles", name: "Secant piles", displayOrder: 60 },
      { key: "jet_grouting", name: "Jet grouting", displayOrder: 70 },
      { key: "dewatering", name: "Dewatering", displayOrder: 80 },
      { key: "underpinning", name: "Underpinning", displayOrder: 90 },
      { key: "other_soe", name: "Other SOE measures", description: "Any other support-of-excavation method not covered above (e.g. slurry wall, ground anchors).", displayOrder: 100 },
    ],
  },
  {
    key: "paving", name: "Paving", displayOrder: 60,
    items: [
      { key: "aggregate_base", name: "Aggregate base course", displayOrder: 10 },
      { key: "asphalt_paving", name: "Asphalt paving", displayOrder: 20 },
      { key: "concrete_paving", name: "Concrete paving / sidewalks", displayOrder: 30 },
      { key: "curb_gutter", name: "Curb & gutter", displayOrder: 40 },
      { key: "pavement_markings", name: "Striping & pavement markings", displayOrder: 50 },
    ],
  },
  {
    key: "other", name: "Other", displayOrder: 70,
    items: [
      { key: "mobilization", name: "Mobilization", description: "Equipment and crew mobilization/demobilization to the site.", displayOrder: 10 },
      { key: "temporary_facilities", name: "Temporary facilities", description: "Field office, sanitation, temporary power/water, and fencing for the duration of the work.", displayOrder: 20 },
      { key: "landscaping", name: "Landscaping & restoration", displayOrder: 30 },
      { key: "traffic_control", name: "Traffic control", displayOrder: 40 },
      { key: "permits_fees", name: "Permits & fees", displayOrder: 50 },
      { key: "survey_layout", name: "Survey & layout", displayOrder: 60 },
      { key: "site_signage", name: "Site signage", displayOrder: 70 },
    ],
  },
];

export const SCOPE_ITEM_STATUS_VALUES = ["not_reviewed", "included", "excluded", "needs_clarification"] as const;
export type ScopeItemStatus = (typeof SCOPE_ITEM_STATUS_VALUES)[number];

export const SCOPE_ITEM_STATUS_LABELS: Record<ScopeItemStatus, string> = {
  not_reviewed: "Not Reviewed",
  included: "Included",
  excluded: "Excluded",
  needs_clarification: "Needs Clarification",
};

export function getScopeItemStatusLabel(status: string | null | undefined): string {
  if (!status) return SCOPE_ITEM_STATUS_LABELS.not_reviewed;
  return SCOPE_ITEM_STATUS_LABELS[status as ScopeItemStatus] || status;
}

/** Derived readiness state — never stored, always computed from item statuses. */
export const SCOPE_READINESS_VALUES = ["not_started", "in_progress", "ready_for_takeoff"] as const;
export type ScopeReadiness = (typeof SCOPE_READINESS_VALUES)[number];

export const SCOPE_READINESS_LABELS: Record<ScopeReadiness, string> = {
  not_started: "Not Started",
  in_progress: "In Progress",
  ready_for_takeoff: "Ready for Takeoff",
};

/**
 * Ready for Takeoff requires every scope item to be intentionally resolved
 * (Included, Excluded, or otherwise reviewed) with zero unresolved Needs
 * Clarification items. Not Started means nothing has been reviewed yet.
 * Everything else (partial review, or any open Needs Clarification) is
 * In Progress. This never touches the Opportunity's own status field.
 */
export function computeScopeReadinessFromCounts(total: number, reviewed: number, needsClarification: number): ScopeReadiness {
  if (total === 0 || reviewed === 0) return "not_started";
  if (needsClarification > 0 || reviewed < total) return "in_progress";
  return "ready_for_takeoff";
}

export function computeScopeReadiness(items: { status: string }[]): ScopeReadiness {
  const total = items.length;
  const reviewed = items.filter(i => i.status !== "not_reviewed").length;
  const needsClarification = items.filter(i => i.status === "needs_clarification").length;
  return computeScopeReadinessFromCounts(total, reviewed, needsClarification);
}

export type ScopeItemSummary = {
  total: number;
  included: number;
  excluded: number;
  needsClarification: number;
  notReviewed: number;
};

export function summarizeScopeItems(items: { status: string }[]): ScopeItemSummary {
  return {
    total: items.length,
    included: items.filter(i => i.status === "included").length,
    excluded: items.filter(i => i.status === "excluded").length,
    needsClarification: items.filter(i => i.status === "needs_clarification").length,
    notReviewed: items.filter(i => i.status === "not_reviewed").length,
  };
}
