const WELLS = new Set([
  "Eat Well", "Nourish Well", "Fit Well", "Relax Well", "Glow Well", "Care Well"
]);
export const KNOWN_BLOCKS = new Set([
  "hero", "signal_strip", "product_rail", "routine_steps", "product_grid", "evidence_note"
]);
const record = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const text = (value) => typeof value === "string" && value.length <= 10000;
const nonempty = (value) => text(value) && value.trim().length > 0;
const number = (value) => typeof value === "number" && Number.isFinite(value) && value >= 0;
const list = (value, predicate, max = 300) => Array.isArray(value) && value.length <= max && value.every(predicate);
const date = (value) => nonempty(value) && Number.isFinite(Date.parse(value));
const optionalText = (value) => value === undefined || text(value);
const httpUrl = (value) => {
  if (!text(value)) return false;
  try { return ["http:", "https:"].includes(new URL(value).protocol); } catch { return false; }
};

function product(value, id) {
  return record(value) && value.id === id &&
    ["id", "sku", "canonicalSku", "name", "brand", "category", "color", "form"].every((key) => nonempty(value[key])) &&
    WELLS.has(value.well) && list(value.functional, nonempty) && list(value.tags, text) &&
    ["price", "stock", "rating", "reviewCount"].every((key) => number(value[key])) &&
    record(value.flags) && typeof value.flags.coupon === "boolean" && typeof value.flags.hasOptions === "boolean" &&
    optionalText(value.recommendationReason) &&
    (value.recommendationScore === undefined || number(value.recommendationScore));
}

export function validatePageConfig(config) {
  const issues = [];
  const result = () => ({ valid: issues.length === 0, issues });
  if (!record(config)) return { valid: false, issues: ["화면 구성 데이터 형식을 확인해 주세요."] };
  if (!record(config.palette) || !["accent", "soft", "ink", "canvas"].every((key) => nonempty(config.palette[key]))) {
    issues.push("화면 색상 정보가 올바르지 않습니다.");
  }
  const products = record(config.products) ? config.products : {};
  if (!record(config.products) || Object.keys(products).length > 300 ||
      !Object.entries(products).every(([id, value]) => product(value, id))) {
    issues.push("상품 정보 형식이 올바르지 않습니다.");
  }
  if (!Array.isArray(config.blocks) || config.blocks.length > 64) {
    issues.push("화면 영역 목록이 올바르지 않습니다.");
    return result();
  }
  const ids = new Set();
  let heroes = 0;
  for (const block of config.blocks) {
    if (!record(block) || !nonempty(block.id) || !nonempty(block.type)) {
      issues.push("화면 영역에 필요한 정보가 없습니다.");
      continue;
    }
    if (ids.has(block.id)) issues.push("화면 영역 ID가 중복되었습니다.");
    ids.add(block.id);
    if (!KNOWN_BLOCKS.has(block.type)) {
      issues.push(`지원하지 않는 화면 영역: ${block.type}`);
      continue;
    }
    if (block.type === "hero") heroes += 1;
    const required = {
      hero: ["eyebrow", "title", "subtitle", "cta"],
      signal_strip: ["title"], product_rail: ["title"], product_grid: ["title"],
      routine_steps: ["title"], evidence_note: ["eyebrow", "title", "body"]
    }[block.type];
    const strings = ["eyebrow", "title", "subtitle", "cta", "body", "variant", "well"];
    let valid = required.every((key) => text(block[key])) && strings.every((key) => optionalText(block[key]));
    if (block.presentation !== undefined) {
      valid &&= record(block.presentation) && Object.values(block.presentation).every((value) => text(value) || number(value));
    }
    const reference = (id) => nonempty(id) && Object.hasOwn(products, id);
    if (block.productIds !== undefined || ["hero", "product_rail", "product_grid"].includes(block.type)) {
      valid &&= list(block.productIds, reference) && new Set(block.productIds).size === block.productIds.length;
    }
    if (block.items !== undefined || block.type === "signal_strip") valid &&= list(block.items, text, 64);
    if (block.steps !== undefined || block.type === "routine_steps") {
      valid &&= list(block.steps, (step) => record(step) && text(step.time) && text(step.label) &&
        (step.productId === undefined || reference(step.productId)), 32);
    }
    if (!valid) issues.push(`${block.id}: 화면 영역 데이터나 상품 참조가 올바르지 않습니다.`);
  }
  if (heroes !== 1) issues.push("대표 배너가 정확히 하나 필요합니다.");
  return result();
}

const rawSignal = (value) => record(value) && nonempty(value.id) && text(value.title) &&
  httpUrl(value.url) && text(value.publishedAt) && text(value.source);
const trendSignal = (value) => rawSignal(value) && number(value.relevance) && value.relevance <= 1 &&
  (value.ageDays === null || (typeof value.ageDays === "number" && Number.isFinite(value.ageDays)));
const sources = (value) => list(value, (source) => record(source) && text(source.name) && httpUrl(source.url) && number(source.itemCount), 8);

export function isResearchPayloadData(value) {
  return record(value) && ["live", "cached"].includes(value.status) && text(value.topic) && date(value.fetchedAt) &&
    sources(value.sources) && list(value.signals, rawSignal, 64) && optionalText(value.fallbackReason);
}

export function isDraftData(value) {
  if (!record(value) || value.schemaVersion !== "1.0" || !nonempty(value.id) ||
      !["draft", "published"].includes(value.status) || !date(value.createdAt) ||
      !text(value.request) || !WELLS.has(value.well) || !text(value.theme) ||
      (value.publishedAt !== undefined && !date(value.publishedAt)) ||
      (value.publicationId !== undefined && !nonempty(value.publicationId))) return false;
  if (validatePageConfig(value).issues.some((issue) => !issue.startsWith("지원하지 않는 화면 영역"))) return false;
  const research = value.research;
  if (!record(research) || !["live", "cached", "failed"].includes(research.status) ||
      !text(research.topic) || !date(research.fetchedAt) || !sources(research.sources) ||
      !list(research.signals, trendSignal, 64) ||
      !list(research.excludedSignals, (signal) => trendSignal(signal) && text(signal.reason), 64) ||
      !["generated", "failed"].includes(research.bannerStatus) ||
      !["bannerEngine", "bannerGeneratedAt", "fallbackReason"].every((key) => optionalText(research[key]))) return false;
  const audit = value.audit;
  return record(audit) && number(audit.includedCount) && number(audit.eventCount) && text(audit.feedback) &&
    list(audit.assumptions, text) && list(audit.excluded, (item) => record(item) && text(item.id) && text(item.name) && text(item.reason)) &&
    record(audit.heroSafety) && typeof audit.heroSafety.safe === "boolean" && date(audit.heroSafety.inspectedAt) &&
    list(audit.heroSafety.violations, (item) => record(item) && text(item.phrase) && text(item.reason) && text(item.type));
}
