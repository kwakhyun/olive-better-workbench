import type { Draft, ResearchPayload, Well } from "@/lib/types";

const WELLS = new Set<Well>([
  "Eat Well",
  "Nourish Well",
  "Fit Well",
  "Relax Well",
  "Glow Well",
  "Care Well"
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function isWell(value: unknown): value is Well {
  return typeof value === "string" && WELLS.has(value as Well);
}

export function isDraft(value: unknown): value is Draft {
  if (!isRecord(value)) return false;
  return (
    typeof value.schemaVersion === "string" &&
    typeof value.id === "string" &&
    (value.status === "draft" || value.status === "published") &&
    typeof value.createdAt === "string" &&
    typeof value.request === "string" &&
    isWell(value.well) &&
    typeof value.theme === "string" &&
    Array.isArray(value.blocks) &&
    isRecord(value.products) &&
    isRecord(value.research) &&
    isRecord(value.audit)
  );
}

export function isResearchPayload(value: unknown): value is ResearchPayload {
  if (!isRecord(value)) return false;
  return (
    (value.status === "live" || value.status === "cached") &&
    typeof value.topic === "string" &&
    typeof value.fetchedAt === "string" &&
    Array.isArray(value.sources) &&
    Array.isArray(value.signals)
  );
}
