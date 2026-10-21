import { isDraftData, isResearchPayloadData } from "./page-schema.mjs";
import type { Draft, ResearchPayload, Well } from "@/lib/types";

const WELLS = new Set<Well>([
  "Eat Well",
  "Nourish Well",
  "Fit Well",
  "Relax Well",
  "Glow Well",
  "Care Well"
]);

export function isWell(value: unknown): value is Well {
  return typeof value === "string" && WELLS.has(value as Well);
}

export function isDraft(value: unknown): value is Draft {
  return isDraftData(value);
}

export function isResearchPayload(value: unknown): value is ResearchPayload {
  return isResearchPayloadData(value);
}
