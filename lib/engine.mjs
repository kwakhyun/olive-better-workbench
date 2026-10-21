import { KNOWN_BLOCKS, validatePageConfig } from "./page-schema.mjs";
export { validatePageConfig } from "./page-schema.mjs";

export const WELL_META = {
  "Eat Well": {
    ko: "잇 웰",
    short: "잘 먹는 균형",
    accent: "#D9E95C",
    soft: "#F1F6D8",
    keywords: [
      "식사", "장", "유산균", "저당", "에너지", "소화", "푸드",
      "nutrition", "gut", "food", "digestion"
    ]
  },
  "Nourish Well": {
    ko: "너리시 웰",
    short: "매일 채우는 영양",
    accent: "#F4C769",
    soft: "#FFF1D6",
    keywords: [
      "영양", "비타민", "미네랄", "면역", "활력", "기초",
      "nutrition", "vitamin", "mineral", "energy"
    ]
  },
  "Fit Well": {
    ko: "핏 웰",
    short: "가볍게 이어가는 움직임",
    accent: "#FF8D67",
    soft: "#FFE5DD",
    keywords: [
      "운동", "근육", "단백질", "러닝", "회복", "액티브", "피트니스",
      "exercise", "fitness", "recovery", "protein", "running", "movement"
    ]
  },
  "Relax Well": {
    ko: "릴랙스 웰",
    short: "잘 쉬는 저녁",
    accent: "#A78DD0",
    soft: "#EEE7F6",
    keywords: [
      "수면", "휴식", "스트레스", "마음", "저녁", "릴랙스", "숙면",
      "sleep", "relaxation", "stress", "rest"
    ]
  },
  "Glow Well": {
    ko: "글로우 웰",
    short: "안에서 시작하는 생기",
    accent: "#F1A7A4",
    soft: "#FCE8E6",
    keywords: [
      "피부", "수분", "콜라겐", "이너뷰티", "탄력", "글로우",
      "skin", "collagen", "beauty", "hydration"
    ]
  },
  "Care Well": {
    ko: "케어 웰",
    short: "생활에 가까운 케어",
    accent: "#82C8B8",
    soft: "#DDF2ED",
    keywords: [
      "눈", "구강", "간", "관절", "가족", "일상", "케어",
      "daily care", "joint", "oral", "eye health"
    ]
  }
};

export const ACTION_WEIGHTS = {
  click: 1,
  like: 3,
  purchase: 7
};

export function normalizeText(value = "") {
  return String(value)
    .toLowerCase()
    .replace(/[0０]/g, "o")
    .replace(/[1１!|]/g, "i")
    .replace(/[3３]/g, "e")
    .replace(/[5５$]/g, "s")
    .replace(/[7７]/g, "t")
    .replace(/[\s\u200b\u200c\u200d_\-.,/\\'"“”‘’()[\]{}:;·~*+^%#@!?<>]/g, "");
}

export function inspectCopy(copy, rules) {
  const normalized = normalizeText(copy);
  const violations = (rules?.prohibited_expressions ?? [])
    .filter((rule) => normalized.includes(normalizeText(rule.phrase)))
    .map((rule) => ({
      phrase: rule.phrase,
      reason: rule.reason,
      type: rule.type
    }));

  return {
    safe: violations.length === 0,
    violations,
    inspectedAt: new Date().toISOString()
  };
}

function productKey(product) {
  return product.canonicalSku || product.sku || normalizeText(product.name);
}

export function curateProducts(products, rules, selectedWell, request = "", events = []) {
  const allowed = new Set(rules?.well_functional?.[selectedWell] ?? []);
  const keyCounts = new Map();
  for (const product of products) {
    const key = productKey(product);
    keyCounts.set(key, (keyCounts.get(key) ?? 0) + 1);
  }
  const excluded = [];
  const accepted = [];
  const requestTokens = keywordTokens(request);
  const eventScores = aggregateEvents(events);

  for (const product of products) {
    if (product.well !== selectedWell) continue;

    const key = productKey(product);
    let reason = "";
    if ((keyCounts.get(key) ?? 0) > 1) reason = "같은 상품이 중복 등록됨";
    else if (!product.stock || product.stock <= 0) reason = "품절";
    else if (!Array.isArray(product.functional) || product.functional.length === 0) {
      reason = "건강 기능 정보가 등록되지 않음";
    } else if (!product.functional.every((item) => allowed.has(item))) {
      reason = "선택한 웰니스 영역과 등록된 건강 기능이 일치하지 않음";
    }

    if (reason) {
      excluded.push({ id: product.id, name: product.name.trim(), reason });
      continue;
    }

    const searchable = normalizeText(
      [product.name, product.brand, product.category, ...(product.tags ?? [])].join(" ")
    );
    const relevance = requestTokens.reduce(
      (score, token) => score + (searchable.includes(normalizeText(token)) ? 1.6 : 0),
      0
    );
    const response = eventScores.products[product.id] ?? 0;
    const quality = product.rating * 1.35 + Math.log10((product.reviewCount ?? 0) + 10);
    const stockConfidence = Math.min(product.stock / 50, 1);
    accepted.push({
      ...product,
      name: product.name.trim(),
      recommendationScore: Number(
        (quality + relevance + response * 0.9 + stockConfidence).toFixed(2)
      ),
      recommendationReason: response
        ? `고객 반응 ${response}점 · 평점 ${product.rating}`
        : relevance
          ? `기획 의도와 잘 맞음 · 평점 ${product.rating}`
          : `평점 ${product.rating} · 리뷰 ${product.reviewCount.toLocaleString("ko-KR")}개`
    });
  }

  accepted.sort((a, b) => b.recommendationScore - a.recommendationScore);
  return { accepted, excluded };
}

export function cleanSignals(rawSignals, request, rules, now = new Date(), wellKeywords = []) {
  const filters = rules?.signal_filters ?? {};
  const adMarkers = filters.ad_markers ?? [];
  const medicalMarkers = filters.medical_markers ?? [];
  const maxAge = Number(filters.stale_days ?? 120);
  const requestTokens = keywordTokens(request);
  const categoryTokens = keywordTokens(wellKeywords.join(" "));
  const seen = new Set();
  const accepted = [];
  const excluded = [];

  for (const signal of rawSignals ?? []) {
    const title = String(signal.title ?? "").trim();
    const normalized = normalizeText(title);
    const publishedAt = signal.publishedAt ? new Date(signal.publishedAt) : null;
    const ageDays =
      publishedAt && !Number.isNaN(publishedAt.getTime())
        ? Math.floor((now.getTime() - publishedAt.getTime()) / 86400000)
        : null;
    let reason = "";

    if (title.length < 8) reason = "내용이 너무 짧음";
    else if (seen.has(normalized)) reason = "중복된 자료";
    else if (adMarkers.some((marker) => normalized.includes(normalizeText(marker)))) {
      reason = "광고성 내용 포함";
    } else if (
      medicalMarkers.some((marker) => normalized.includes(normalizeText(marker)))
    ) {
      reason = "질병 치료 또는 의약품 관련 내용";
    } else if (ageDays !== null && ageDays < -1) reason = "기준 시점보다 미래의 자료";
    else if (ageDays !== null && ageDays > maxAge) reason = "허용 기간보다 오래된 자료";

    seen.add(normalized);
    const relevanceHits = requestTokens.filter((token) =>
      normalized.includes(normalizeText(token))
    );
    const categoryHits = categoryTokens.filter((token) => normalized.includes(normalizeText(token)));
    const relevance = requestTokens.length || categoryTokens.length
      ? Math.min(1, 0.24 + relevanceHits.length / Math.max(3, requestTokens.length) +
          Math.min(0.2, categoryHits.length * 0.07))
      : 0.35;

    if (!reason && relevance < 0.28) reason = "기획 요청과의 관련성이 낮음";
    const enriched = {
      ...signal,
      title,
      relevance: Number(relevance.toFixed(2)),
      ageDays
    };
    if (reason) excluded.push({ ...enriched, reason });
    else accepted.push(enriched);
  }

  accepted.sort((a, b) => b.relevance - a.relevance);
  return { accepted: accepted.slice(0, 12), excluded };
}

export function resolveResearchFallback(cache, errorMessage) {
  if (!cache?.signals?.length) return null;
  return {
    ...cache,
    status: "cached",
    fallbackReason: errorMessage || "공개 소스 연결에 실패했습니다."
  };
}

export function aggregateEvents(events = []) {
  const products = {};
  const blocks = {};
  const wells = {};
  for (const event of events) {
    const weight = ACTION_WEIGHTS[event.type] ?? 0;
    if (!weight) continue;
    if (event.productId) products[event.productId] = (products[event.productId] ?? 0) + weight;
    if (event.blockId) blocks[event.blockId] = (blocks[event.blockId] ?? 0) + weight;
    if (event.well) wells[event.well] = (wells[event.well] ?? 0) + weight;
  }
  return { products, blocks, wells, total: events.length };
}

export function inferWell(request, preferredWell) {
  if (preferredWell && WELL_META[preferredWell]) return preferredWell;
  const normalized = normalizeText(request);
  const ranked = Object.entries(WELL_META)
    .map(([well, meta]) => ({
      well,
      score: meta.keywords.reduce(
        (score, keyword) => score + (normalized.includes(normalizeText(keyword)) ? 1 : 0),
        0
      )
    }))
    .sort((a, b) => b.score - a.score);
  return ranked[0].score > 0 ? ranked[0].well : "Nourish Well";
}

function keywordTokens(request) {
  return String(request)
    .split(/[\s,./·|]+/)
    .map((item) => item.trim())
    .filter((item) => item.length >= 2)
    .slice(0, 64);
}

function themeFromRequest(request, well) {
  const normalized = normalizeText(request);
  if (/장마|습기|비오는|비날씨/.test(normalized)) return "습한 계절에도 흐트러지지 않는 루틴";
  if (/여름|더위|휴가/.test(normalized)) return "가벼운 여름을 위한 데일리 루틴";
  if (/직장|오피스|출근/.test(normalized)) return "바쁜 하루 사이, 나를 챙기는 작은 루틴";
  if (/초보|입문|처음/.test(normalized)) return "부담 없이 시작하는 첫 웰니스 루틴";
  if (/저녁|밤|수면|휴식/.test(normalized)) return "잘 쉬는 저녁이 만드는 내일의 리듬";
  return `${WELL_META[well].short}, 오늘부터 가볍게`;
}

function defaultBanner(request, well) {
  const theme = themeFromRequest(request, well);
  return {
    eyebrow: `OLIVE BETTER · ${well.toUpperCase()}`,
    title: theme,
    subtitle: "공개 트렌드와 상품 안전 기준을 함께 살펴 고른 웰니스 루틴을 만나보세요.",
    cta: "나에게 맞는 루틴 보기"
  };
}

const BLOCK_LABELS = {
  signals: "트렌드 근거",
  "editors-pick": "에디터 추천",
  routine: "일상 루틴",
  "more-to-explore": "추가 상품",
  "why-this": "선정 기준"
};

function feedbackExplanation(scores, selectedWell) {
  const entries = Object.entries(scores.blocks).sort((a, b) => b[1] - a[1]);
  if (!entries.length) {
    return "아직 고객 반응이 없어 평점, 리뷰 수, 재고를 기준으로 기본 구성을 만들었습니다.";
  }
  const [topBlock, topScore] = entries[0];
  const purchaseCount = Object.values(scores.products).filter((score) => score >= 7).length;
  const blockLabel = BLOCK_LABELS[topBlock] ?? topBlock;
  const purchaseFeedback = purchaseCount
    ? ` 구매 반응이 있던 상품 ${purchaseCount}개를 우선 반영했습니다.`
    : "";
  return `${blockLabel} 영역의 고객 반응 ${topScore}점을 반영해 앞쪽에 배치하고, ${selectedWell} 상품을 더 많이 구성했습니다.${purchaseFeedback}`;
}

export function createDraft({
  request,
  selectedWell,
  products,
  rules,
  signals,
  events = [],
  banner,
  research
}) {
  const well = inferWell(request, selectedWell);
  const meta = WELL_META[well];
  const scores = aggregateEvents(events);
  const curated = curateProducts(products, rules, well, request, events);
  const selected = curated.accepted.slice(0, scores.total ? 14 : 10);
  const theme = themeFromRequest(request, well);
  const heroCopy = banner ?? defaultBanner(request, well);
  const heroSafety = inspectCopy(
    `${heroCopy.eyebrow} ${heroCopy.title} ${heroCopy.subtitle} ${heroCopy.cta}`,
    rules
  );
  const blockPool = [
    {
      id: "signals",
      type: "signal_strip",
      title: "지금 주목할 웰니스 트렌드",
      items: (signals ?? []).slice(0, 5).map((signal) => signal.title)
    },
    {
      id: "editors-pick",
      type: "product_rail",
      title: `${meta.ko} 에디터 픽`,
      subtitle: "건강 기능, 재고, 중복 여부를 확인한 상품만 모았어요.",
      productIds: selected.slice(0, 7).map((product) => product.id),
      presentation: { density: "airy", emphasis: "first", tone: meta.soft }
    },
    {
      id: "routine",
      type: "routine_steps",
      title: "일상에 자연스럽게 더하는 3단계",
      steps: [
        { time: "MORNING", label: "시작은 가볍게", productId: selected[0]?.id },
        { time: "DAY", label: "내 리듬에 맞게", productId: selected[1]?.id },
        { time: "EVENING", label: "차분하게 마무리", productId: selected[2]?.id }
      ]
    },
    {
      id: "more-to-explore",
      type: "product_grid",
      title: "함께 살펴보면 좋은 상품",
      productIds: selected.slice(4).map((product) => product.id),
      presentation: { columns: 4, tone: "#F6F5F1" }
    },
    {
      id: "why-this",
      type: "evidence_note",
      eyebrow: "BETTER STANDARD",
      title: "많이 보여 주기보다, 기준에 맞게 고르기",
      body: `안전 기준에 맞지 않는 ${curated.excluded.length}개 상품을 제외하고 ${selected.length}개를 추천했습니다. ${feedbackExplanation(scores, well)}`
    }
  ];

  const typePreference =
    well === "Relax Well"
      ? ["routine_steps", "product_rail", "evidence_note", "product_grid", "signal_strip"]
      : well === "Fit Well"
        ? ["routine_steps", "signal_strip", "product_rail", "product_grid", "evidence_note"]
        : ["signal_strip", "product_rail", "routine_steps", "product_grid", "evidence_note"];

  const feedbackSorted = [...blockPool].sort((a, b) => {
    const scoreGap = (scores.blocks[b.id] ?? 0) - (scores.blocks[a.id] ?? 0);
    if (scoreGap) return scoreGap;
    return typePreference.indexOf(a.type) - typePreference.indexOf(b.type);
  });

  const draft = {
    schemaVersion: "1.0",
    id: `draft-${Date.now()}`,
    status: "draft",
    createdAt: new Date().toISOString(),
    request,
    well,
    theme,
    palette: {
      accent: meta.accent,
      soft: meta.soft,
      ink: "#172018",
      canvas: "#FAFAF6"
    },
    research,
    blocks: [
      {
        id: "hero",
        type: "hero",
        variant: well === "Relax Well" ? "soft-motion" : "editorial",
        ...heroCopy,
        well,
        productIds: selected.slice(0, 3).map((product) => product.id),
        presentation: { tone: meta.soft, accent: meta.accent }
      },
      ...feedbackSorted
    ],
    products: Object.fromEntries(selected.map((product) => [product.id, product])),
    audit: {
      includedCount: selected.length,
      excluded: curated.excluded,
      heroSafety,
      feedback: feedbackExplanation(scores, well),
      eventCount: events.length,
      assumptions:
        (signals ?? []).length < 3
          ? ["기획 요청과 관련된 최신 자료가 적어 상품 품질 점수의 비중을 높였습니다."]
          : []
    }
  };
  return draft;
}

export function canPublish(draft, rules) {
  if (!draft) return { allowed: false, reasons: ["발행할 초안이 없습니다."] };
  const config = validatePageConfig(draft);
  const fatalConfig = config.issues.filter((issue) => !issue.startsWith("지원하지 않는 화면 영역"));
  if (fatalConfig.length) return { allowed: false, reasons: fatalConfig, config };
  const hero = draft.blocks.find((block) => block.type === "hero");
  const safety = inspectCopy(
    draft.blocks.filter((block) => KNOWN_BLOCKS.has(block.type)).flatMap((block) => [
      block.eyebrow, block.title, block.subtitle, block.cta, block.body,
      ...(Array.isArray(block.items) ? block.items : []),
      ...(Array.isArray(block.steps) ? block.steps.flatMap((step) => [step.time, step.label]) : [])
    ]).concat(Object.values(draft.products).flatMap((product) => [
      product.name, product.brand, product.recommendationReason
    ])).filter((value) => typeof value === "string").join(" "),
    rules
  );
  const reasons = [];
  if (!safety.safe) reasons.push(...safety.violations.map((item) => item.reason));
  if ([hero.eyebrow, hero.title, hero.subtitle, hero.cta].some((value) => !value.trim())) {
    reasons.push("대표 배너의 문구를 모두 입력해 주세요.");
  }
  if (draft.research?.bannerStatus !== "generated") {
    reasons.push("안전한 대표 문구가 생성되지 않았습니다.");
  }
  if (!draft.research?.signals?.length) reasons.push("발행에 사용할 트렌드 근거가 없습니다.");
  if (!Object.keys(draft.products ?? {}).length) reasons.push("안전 기준을 통과한 상품이 없습니다.");
  return { allowed: reasons.length === 0, reasons, safety, config };
}
