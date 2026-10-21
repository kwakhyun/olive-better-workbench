import products from "../../data/products.json" with { type: "json" };
import rules from "../../data/rules.json" with { type: "json" };
import { cleanSignals, createDraft, WELL_META } from "../../lib/engine.mjs";

export { products, rules };
export function makeDraft(overrides = {}) {
  const now = new Date().toISOString();
  const request = "직장인 장마철 출근 전 운동 루틴";
  const { accepted: signals } = cleanSignals([{
    id: "regression-signal", title: "장마철 출근 전 운동과 회복 루틴에 대한 관심 증가",
    url: "https://example.com/trend", publishedAt: now, source: "Regression fixture"
  }], request, rules, new Date(), WELL_META["Fit Well"].keywords);
  return createDraft({
    request, selectedWell: "Fit Well", products, rules, signals, events: [],
    research: {
      status: "live", topic: request, fetchedAt: now,
      sources: [{ name: "Regression fixture", url: "https://example.com", itemCount: signals.length }],
      signals, excludedSignals: [], bannerStatus: "generated"
    },
    ...overrides
  });
}
