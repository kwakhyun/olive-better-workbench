import assert from "node:assert/strict";
import test, { after } from "node:test";
import { testDatabase } from "./helpers/database.mjs";
import { makeDraft, products } from "./helpers/fixtures.mjs";
import { editDraftHero, removeDraftProduct } from "../lib/draft-editing.mjs";
import rules from "../data/rules.json" with { type: "json" };

const root = new URL("../", import.meta.url);
const TEST_OPERATOR_EMAIL = "operator@test.local";
process.env.OPERATOR_EMAILS = TEST_OPERATOR_EMAIL;

const database = await testDatabase();
after(() => database.close());

async function requestWorker(
  pathname = "/",
  init = { headers: { accept: "text/html" } },
  authenticated = true
) {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}-${pathname}`);
  const { default: worker } = await import(workerUrl.href);
  const requestHeaders = new Headers(init.headers);
  if (!requestHeaders.has("cf-connecting-ip")) requestHeaders.set("cf-connecting-ip", crypto.randomUUID());
  if (authenticated) {
    requestHeaders.set("oai-authenticated-user-email", TEST_OPERATOR_EMAIL);
  }
  return worker.fetch(
    new Request(`http://localhost${pathname}`, { ...init, headers: requestHeaders }),
    {
      ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) },
      DB: database
    },
    {
      waitUntil() {},
      passThroughOnException() {}
    }
  );
}

async function render(pathname = "/") {
  return requestWorker(pathname);
}

test("운영자 화면을 서버 렌더링한다", async () => {
  const response = await render("/");
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /Better Workbench/);
  assert.match(html, /웰니스 기획전/);
  assert.match(html, /트렌드 조사하고 초안 만들기/);
  assert.doesNotMatch(html, /codex-preview|react-loading-skeleton/);
});

test("고객 화면은 발행본을 조회하는 동안 안전한 로딩 상태를 렌더링한다", async () => {
  const response = await render("/shop");
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /LOADING CAMPAIGN/);
  assert.match(html, /웰니스 기획전을/);
  assert.doesNotMatch(html, /DRAFT · 비공개/);
});

test("소셜 미리보기 자산이 빌드 입력에 존재한다", async () => {
  const { access } = await import("node:fs/promises");
  await assert.doesNotReject(access(new URL("public/og.png", root)));
});

test("초안 조립 API가 서버의 상품 원본과 안전 규칙으로 결과를 만든다", async () => {
  const now = new Date().toISOString();
  const response = await requestWorker("/api/assemble-draft", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      request: "출근 전 운동과 회복 루틴을 찾는 초보 직장인",
      well: "Fit Well",
      research: {
        status: "live",
        topic: "직장인 운동 회복",
        fetchedAt: now,
        sources: [{ name: "Test", url: "https://example.com", itemCount: 3 }],
        signals: [
          {
            id: "signal-1",
            title: "초보 직장인의 출근 전 운동과 회복 루틴 관심 증가",
            url: "https://example.com/signal-1",
            publishedAt: now,
            source: "Test"
          }
        ]
      },
      events: [],
      bannerStatus: "generated",
      bannerEngine: "test-safe-copy-engine",
      bannerGeneratedAt: now,
      banner: {
        eyebrow: "OLIVE BETTER · FIT WELL",
        title: "움직이는 하루를 위한 가벼운 루틴",
        subtitle: "안전 기준으로 고른 움직임과 회복 루틴이에요.",
        cta: "움직임 루틴 보기"
      }
    })
  });

  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.draft.status, "draft");
  assert.equal(payload.draft.well, "Fit Well");
  assert.equal(Object.keys(payload.draft.products).length, 10);
  assert.equal(payload.draft.research.signals.length, 1);
});

test("발행본과 고객 반응을 공유 저장소에 기록하고 다음 초안에 반영한다", async () => {
  const now = new Date().toISOString();
  const assemblyInput = {
    request: "출근 전 운동과 회복 루틴을 찾는 초보 직장인",
    well: "Fit Well",
    research: {
      status: "live",
      topic: "직장인 운동 회복",
      fetchedAt: now,
      sources: [{ name: "Test", url: "https://example.com", itemCount: 1 }],
      signals: [{
        id: "shared-signal-1",
        title: "초보 직장인의 출근 전 운동과 회복 루틴 관심 증가",
        url: "https://example.com/shared-signal-1",
        publishedAt: now,
        source: "Test"
      }]
    },
    bannerStatus: "generated",
    bannerEngine: "test-safe-copy-engine",
    bannerGeneratedAt: now,
    banner: {
      eyebrow: "OLIVE BETTER · FIT WELL",
      title: "움직이는 하루를 위한 가벼운 루틴",
      subtitle: "안전 기준으로 고른 움직임과 회복 루틴이에요.",
      cta: "움직임 루틴 보기"
    }
  };

  const assembled = await requestWorker("/api/assemble-draft", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(assemblyInput)
  });
  const { draft } = await assembled.json();
  const published = await requestWorker("/api/campaign", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ draft })
  });
  assert.equal(published.status, 200);

  const campaignResponse = await requestWorker("/api/campaign");
  const { campaign } = await campaignResponse.json();
  assert.equal(campaign.status, "published");
  assert.equal(campaign.id, draft.id);

  const product = Object.values(campaign.products)[0];
  const block = campaign.blocks.find((entry) => entry.type === "product_rail" && entry.productIds?.includes(product.id));
  const eventResponse = await requestWorker("/api/events", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      type: "purchase",
      campaignId: campaign.id,
      publicationId: campaign.publicationId,
      productId: product.id,
      blockId: block.id,
      well: product.well
    })
  });
  assert.equal(eventResponse.status, 201);

  const nextAssembly = await requestWorker("/api/assemble-draft", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(assemblyInput)
  });
  const nextPayload = await nextAssembly.json();
  assert.equal(nextPayload.draft.audit.eventCount, 1);
});

test("운영 API는 등록되지 않은 계정의 직접 호출을 거부한다", async () => {
  const response = await requestWorker("/api/generate-banner", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ request: "출근 전 루틴", well: "Fit Well" })
  }, false);
  assert.equal(response.status, 403);
});

test("같은 트렌드 요청은 서버 캐시를 사용하고 호출 제한을 적용한다", async () => {
  const previous = process.env.TEST_CONNECTORS;
  process.env.TEST_CONNECTORS = "true";
  try {
    const call = (ip) => requestWorker("/api/research", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "cf-connecting-ip": ip
      },
      body: JSON.stringify({ request: "장마철 출근 전 직장인 운동 루틴", well: "Fit Well" })
    });
    const first = await call("198.51.100.10");
    const second = await call("198.51.100.10");
    assert.equal((await first.json()).status, "live");
    assert.equal((await second.json()).status, "cached");

    let limited;
    for (let index = 0; index < 7; index += 1) {
      limited = await call("198.51.100.11");
    }
    assert.equal(limited.status, 429);
  } finally {
    if (previous === undefined) delete process.env.TEST_CONNECTORS;
    else process.env.TEST_CONNECTORS = previous;
  }
});

test("초안 조립 API는 허용되지 않은 Well과 근거 없는 요청을 거부한다", async () => {
  const response = await requestWorker("/api/assemble-draft", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ request: "테스트 기획", well: "Unknown Well", research: null })
  });

  assert.equal(response.status, 422);
});

function post(path, body, authenticated = true) {
  return requestWorker(path, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body)
  }, authenticated);
}

async function publishFixture(draft = makeDraft()) {
  const response = await post("/api/campaign", { draft });
  assert.equal(response.status, 200, await response.clone().text());
  return (await response.json()).campaign;
}

test("발행 API는 변경된 상품 원본과 판매 불가 상품을 거부하고 기존 발행본을 유지한다", async () => {
  const baseline = await publishFixture();
  const productId = Object.keys(baseline.products)[0];
  for (const changes of [
    { stock: 0 }, { functional: [] }, { price: 1 }, { name: "질병 치료 100% 효과" },
    { well: "Relax Well" }
  ]) {
    const draft = structuredClone(baseline);
    Object.assign(draft.products[productId], changes);
    const response = await post("/api/campaign", { draft });
    assert.equal(response.status, 422, JSON.stringify(changes));
  }
  // An otherwise well-formed product with an unknown ID must also be rejected.
  const unknown = structuredClone(baseline);
  const original = unknown.products[productId];
  delete unknown.products[productId];
  unknown.products["unknown-sku"] = { ...original, id: "unknown-sku" };
  for (const block of unknown.blocks) {
    if (block.productIds) block.productIds = block.productIds.map((id) => id === productId ? "unknown-sku" : id);
    for (const step of block.steps ?? []) if (step.productId === productId) step.productId = "unknown-sku";
  }
  assert.equal((await post("/api/campaign", { draft: unknown })).status, 422);
  const current = await requestWorker("/api/campaign");
  assert.equal((await current.json()).campaign.publicationId, baseline.publicationId);
});

test("발행 API는 필수 화면 구조와 중첩 필드가 손상된 입력을 422로 거부한다", async () => {
  for (const mutate of [
    (draft) => { delete draft.palette; },
    (draft) => { draft.blocks = []; },
    (draft) => { draft.blocks = [null]; },
    (draft) => { draft.blocks.find((block) => block.type === "product_rail").productIds = "invalid"; },
    (draft) => { draft.blocks[0].productIds = ["missing-product"]; },
    (draft) => { draft.blocks[0].steps = [null]; },
    (draft) => { draft.blocks.push({ ...draft.blocks[0] }); },
    (draft) => { Object.values(draft.products)[0].flags = null; },
    (draft) => { draft.research.signals = [null]; },
    (draft) => { draft.audit.excluded = {}; }
  ]) {
    const draft = makeDraft();
    mutate(draft);
    assert.equal((await post("/api/campaign", { draft })).status, 422);
  }
});

test("발행 API는 대표 배너 외의 노출 문구도 검사하고 추천 데이터는 서버에서 재계산한다", async () => {
  const unsafe = makeDraft();
  unsafe.blocks.find((block) => block.type === "evidence_note").body = "질병 치료 100% 효과";
  assert.equal((await post("/api/campaign", { draft: unsafe })).status, 422);
  const draft = makeDraft();
  const product = Object.values(draft.products)[0];
  product.recommendationScore = 999999;
  product.recommendationReason = "질병 치료 100% 효과";
  const campaign = await publishFixture(draft);
  assert.notEqual(campaign.products[product.id].recommendationScore, 999999);
  assert.doesNotMatch(campaign.products[product.id].recommendationReason, /질병 치료/);
});

test("고객 반응은 캠페인과 발행 버전, 상품이 있는 상호작용 영역이 일치할 때만 저장한다", async () => {
  const draft = makeDraft();
  const first = await publishFixture(draft);
  const productId = Object.keys(first.products)[0];
  const event = {
    type: "purchase", campaignId: first.id, publicationId: first.publicationId,
    productId, well: first.well, blockId: "editors-pick"
  };
  const second = await publishFixture(draft);
  assert.notEqual(second.publicationId, first.publicationId);
  assert.equal((await post("/api/events", event, false)).status, 409);
  const current = { ...event, publicationId: second.publicationId };
  assert.equal((await post("/api/events", { ...current, campaignId: "old-campaign" }, false)).status, 409);
  assert.equal((await post("/api/events", { ...current, publicationId: undefined }, false)).status, 409);
  assert.equal((await post("/api/events", { ...current, blockId: "why-this" }, false)).status, 422);
  assert.equal((await post("/api/events", { ...current, blockId: "hero" }, false)).status, 422);
  const lastProduct = Object.keys(second.products).at(-1);
  assert.equal((await post("/api/events", { ...current, productId: lastProduct }, false)).status, 422);
  const accepted = await post("/api/events", current, false);
  assert.equal(accepted.status, 201);
  const { event: stored } = await accepted.json();
  const row = await database.prepare("SELECT campaign_id, publication_id, block_id FROM customer_events WHERE id = ?").bind(stored.id).first();
  assert.equal(row.campaign_id, second.id);
  assert.equal(row.publication_id, second.publicationId);
  assert.equal(row.block_id, "editors-pick");
});


test("서버 카탈로그에 있어도 품절, 기능 누락, Well 불일치 상품은 발행할 수 없다", async () => {
  const candidates = [
    products.find((product) => product.well === "Fit Well" && product.stock === 0),
    products.find((product) => product.well === "Fit Well" && product.functional.length === 0),
    products.find((product) => product.well === "Relax Well" && product.stock > 0)
  ];
  for (const candidate of candidates) {
    assert.ok(candidate);
    const draft = makeDraft();
    const id = Object.keys(draft.products)[0];
    delete draft.products[id];
    draft.products[candidate.id] = candidate;
    for (const block of draft.blocks) {
      if (block.productIds) block.productIds = block.productIds.map((value) => value === id ? candidate.id : value);
      for (const step of block.steps ?? []) if (step.productId === id) step.productId = candidate.id;
    }
    assert.equal((await post("/api/campaign", { draft })).status, 422);
  }
});

test("발행본을 수정해 다시 발행하면 편집 내용과 새로운 발행 버전이 저장된다", async () => {
  const first = await publishFixture();
  const id = Object.keys(first.products)[0];
  const revised = removeDraftProduct(editDraftHero(first, "title", "다시 고른 오늘의 운동 루틴", rules), id);
  const second = await publishFixture(revised);
  assert.equal(second.id, first.id);
  assert.notEqual(second.publicationId, first.publicationId);
  assert.equal(second.blocks[0].title, "다시 고른 오늘의 운동 루틴");
  assert.equal(second.products[id], undefined);
  assert.equal(second.audit.includedCount, Object.keys(first.products).length - 1);
});
