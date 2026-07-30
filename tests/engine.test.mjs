import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  WELL_META,
  canPublish,
  cleanSignals,
  createDraft,
  curateProducts,
  inspectCopy,
  resolveResearchFallback,
  validatePageConfig
} from "../lib/engine.mjs";

const products = JSON.parse(
  await readFile(new URL("../data/products.json", import.meta.url), "utf8")
);
const rules = JSON.parse(
  await readFile(new URL("../data/rules.json", import.meta.url), "utf8")
);
const now = new Date("2026-07-30T08:00:00.000Z");
const signals = [
  {
    id: "s1",
    title: "장마철 직장인의 출근 전 운동 루틴 관심 증가",
    url: "https://example.com/1",
    publishedAt: "2026-07-29T00:00:00.000Z",
    source: "Test"
  },
  {
    id: "s2",
    title: "초보 러너가 주목하는 단백질과 회복 루틴",
    url: "https://example.com/2",
    publishedAt: "2026-07-28T00:00:00.000Z",
    source: "Test"
  },
  {
    id: "s3",
    title: "출근 전 짧은 웰니스 습관과 컨디션 관리",
    url: "https://example.com/3",
    publishedAt: "2026-07-27T00:00:00.000Z",
    source: "Test"
  }
];
const cleaned = cleanSignals(signals, "장마철 직장인 출근 전 운동 루틴", rules, now);

function research(overrides = {}) {
  return {
    status: "live",
    topic: "장마철 직장인 운동 루틴",
    fetchedAt: now.toISOString(),
    sources: [{ name: "Test RSS", url: "https://example.com/rss", itemCount: 3 }],
    signals: cleaned.accepted,
    excludedSignals: [],
    bannerStatus: "live",
    bannerModel: "test-model",
    ...overrides
  };
}

function makeDraft(overrides = {}) {
  return createDraft({
    request: "장마철 직장인 출근 전 운동 루틴",
    selectedWell: "Fit Well",
    products,
    rules,
    signals: cleaned.accepted,
    events: [],
    banner: {
      eyebrow: "OLIVE BETTER",
      title: "비 오는 날에도 내 리듬은 가볍게",
      subtitle: "안전 기준으로 고른 출근 전 웰니스 루틴을 만나보세요.",
      cta: "루틴 시작하기"
    },
    research: research(),
    ...overrides
  });
}

test("300개 데모 카탈로그와 의도된 결함을 일관되게 정제한다", () => {
  assert.equal(products.length, 300);
  const result = curateProducts(
    products,
    rules,
    "Fit Well",
    "초보 러너 운동 회복 단백질",
    []
  );
  assert.ok(result.accepted.length > 10);
  const reasons = new Set(result.excluded.map((item) => item.reason));
  assert.ok(reasons.has("품절"));
  assert.ok(reasons.has("등록 건강 기능 정보 누락"));
  assert.ok(reasons.has("Well 카테고리와 건강 기능 정보 불일치"));
  assert.ok(reasons.has("동일 상품 중복 레코드"));
  assert.ok(
    result.accepted.every(
      (product) =>
        product.stock > 0 &&
        product.functional.length > 0 &&
        product.functional.every((item) =>
          rules.well_functional["Fit Well"].includes(item)
        )
    )
  );
});

test("신호의 광고·의약품·오래됨·중복을 사유와 함께 제외한다", () => {
  const input = [
    ...signals,
    { ...signals[0], id: "duplicate" },
    {
      id: "ad",
      title: "광고 쿠폰 코드로 만나는 운동 루틴",
      publishedAt: "2026-07-29",
      source: "Test"
    },
    {
      id: "medical",
      title: "운동 후 통증 치료 처방과 복용량 질문",
      publishedAt: "2026-07-29",
      source: "Test"
    },
    {
      id: "stale",
      title: "직장인의 오래된 출근 전 운동 루틴",
      publishedAt: "2025-01-01",
      source: "Test"
    }
  ];
  const result = cleanSignals(input, "직장인 출근 전 운동 루틴", rules, now);
  const reasons = new Set(result.excluded.map((item) => item.reason));
  assert.ok(reasons.has("중복 신호"));
  assert.ok(reasons.has("광고성 표현"));
  assert.ok(reasons.has("의약품·질병 질의 가능성"));
  assert.ok(reasons.has("기준 시점 초과"));
});

test("띄어쓰기와 기호로 우회한 금지 문구도 차단한다", () => {
  const result = inspectCopy("질 병-치료, 100 % 효 과를 약 대 신!", rules);
  assert.equal(result.safe, false);
  assert.ok(result.violations.some((item) => item.phrase === "질병 치료"));
  assert.ok(result.violations.some((item) => item.phrase === "100% 효과"));
  assert.ok(result.violations.some((item) => item.phrase === "약 대신"));
  assert.equal(inspectCopy("일상 속 균형 잡힌 웰니스 루틴", rules).safe, true);
});

test("선택한 Well의 영문 공개 연구도 관련 신호로 채택하고 미래 자료는 제외한다", () => {
  const context = `장마철 직장인 웰니스 루틴 ${WELL_META["Fit Well"].keywords.join(" ")}`;
  const result = cleanSignals(
    [
      {
        id: "europe-pmc-current",
        title: "Protein intake and exercise recovery habits among office workers",
        url: "https://europepmc.org/article/MED/1",
        publishedAt: "2026-07-20",
        source: "Europe PMC"
      },
      {
        id: "openalex-future",
        title: "Future exercise recovery study",
        url: "https://openalex.org/W2",
        publishedAt: "2026-08-15",
        source: "OpenAlex"
      }
    ],
    context,
    rules,
    new Date("2026-07-30T00:00:00.000Z")
  );

  assert.deepEqual(result.accepted.map((item) => item.id), ["europe-pmc-current"]);
  assert.equal(result.excluded[0].reason, "기준 시점 이후 자료");
});

test("영문 질병·임상·동물 연구 신호도 고객 기획전 근거에서 제외한다", () => {
  const result = cleanSignals(
    [
      {
        id: "medical-en",
        title: "Clinical treatment for cancer patients after surgery",
        publishedAt: "2026-07-20",
        source: "Europe PMC"
      },
      {
        id: "animal-en",
        title: "Exercise recovery effects in rodent studies",
        publishedAt: "2026-07-20",
        source: "Europe PMC"
      }
    ],
    `웰니스 운동 ${WELL_META["Fit Well"].keywords.join(" ")}`,
    rules,
    new Date("2026-07-30T00:00:00.000Z")
  );

  assert.equal(result.accepted.length, 0);
  assert.ok(result.excluded.every((item) => item.reason === "의약품·질병 질의 가능성"));
});

test("서로 다른 MD 요청과 Well은 테마·상품·영역 순서를 바꾼다", () => {
  const fit = makeDraft();
  const relax = makeDraft({
    request: "스마트폰 사용 후 편안한 저녁 휴식 루틴",
    selectedWell: "Relax Well"
  });
  assert.notEqual(fit.theme, relax.theme);
  assert.notEqual(fit.well, relax.well);
  assert.notDeepEqual(Object.keys(fit.products), Object.keys(relax.products));
  assert.notDeepEqual(
    fit.blocks.map((block) => block.type),
    relax.blocks.map((block) => block.type)
  );
});

test("반응이 없을 때 품질 기반 기본 결과를 만들고 발행할 수 있다", () => {
  const draft = makeDraft();
  assert.equal(draft.audit.eventCount, 0);
  assert.equal(Object.keys(draft.products).length, 10);
  assert.match(draft.audit.feedback, /아직 고객 반응이 없어/);
  assert.equal(canPublish(draft, rules).allowed, true);
});

test("클릭·좋아요·구매가 다음 상품 수·점수·영역 순서에 재적용된다", () => {
  const baseline = makeDraft();
  const productId = Object.keys(baseline.products)[0];
  const events = [
    { type: "click", productId, blockId: "editors-pick", well: "Fit Well" },
    { type: "like", productId, blockId: "editors-pick", well: "Fit Well" },
    { type: "purchase", productId, blockId: "editors-pick", well: "Fit Well" }
  ];
  const learned = makeDraft({ events });
  assert.equal(learned.audit.eventCount, 3);
  assert.equal(Object.keys(learned.products).length, 14);
  assert.equal(learned.blocks[1].id, "editors-pick");
  assert.match(learned.products[productId].recommendationReason, /고객 반응 11점/);
  assert.match(learned.audit.feedback, /구매 신호 상품 1개 우선/);
});

test("실제 LLM 문구가 없거나 운영자 수정 문구가 위험하면 발행을 막는다", () => {
  const noLlm = makeDraft({ research: research({ bannerStatus: "unavailable" }) });
  assert.equal(canPublish(noLlm, rules).allowed, false);
  assert.match(canPublish(noLlm, rules).reasons.join(" "), /실제 LLM/);

  const unsafe = makeDraft({
    banner: {
      eyebrow: "OLIVE BETTER",
      title: "질병 치료 100% 효과",
      subtitle: "과장 문구",
      cta: "구매"
    }
  });
  assert.equal(canPublish(unsafe, rules).allowed, false);
});

test("공개 소스 실패 시 이전 성공 자료만 기준 시점과 이유를 붙여 되살린다", () => {
  const fallback = resolveResearchFallback(
    { signals, fetchedAt: "2026-07-20T00:00:00.000Z", topic: "기존 조사" },
    "RSS HTTP 503"
  );
  assert.equal(fallback.status, "cached");
  assert.equal(fallback.fetchedAt, "2026-07-20T00:00:00.000Z");
  assert.equal(fallback.fallbackReason, "RSS HTTP 503");
  assert.equal(resolveResearchFallback(null, "실패"), null);
});

test("알 수 없는 영역만 격리하고 나머지 화면 데이터는 유지한다", () => {
  const draft = makeDraft();
  const malformed = {
    ...draft,
    blocks: [
      draft.blocks[0],
      { id: "future-slot", type: "unsupported_future_block" },
      ...draft.blocks.slice(1)
    ]
  };
  const result = validatePageConfig(malformed);
  assert.equal(result.valid, false);
  assert.match(result.issues.join(" "), /알 수 없는 화면 영역/);
  assert.equal(canPublish(malformed, rules).allowed, true);
});
