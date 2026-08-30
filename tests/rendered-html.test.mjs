import assert from "node:assert/strict";
import test from "node:test";

const root = new URL("../", import.meta.url);
const TEST_OPERATOR_EMAIL = "operator@test.local";
process.env.OPERATOR_EMAILS = TEST_OPERATOR_EMAIL;

class FakeD1 {
  campaign = null;
  events = [];
  cache = new Map();
  limits = new Map();

  prepare(sql) {
    const getDatabase = () => this;
    const normalized = sql.replace(/\s+/g, " ").trim().toLowerCase();
    let values = [];
    return {
      bind(...nextValues) {
        values = nextValues;
        return this;
      },
      async first() {
        if (normalized.includes("insert into api_rate_limits")) {
          const bucket = values[0];
          const database = getDatabase();
          const count = (database.limits.get(bucket) ?? 0) + 1;
          database.limits.set(bucket, count);
          return { count };
        }
        if (normalized.includes("from campaign_publications")) {
          const database = getDatabase();
          return database.campaign ? { draftJson: database.campaign } : null;
        }
        if (normalized.includes("count(*)") && normalized.includes("customer_events")) {
          const database = getDatabase();
          return { count: database.events.filter((event) => event.campaignId === values[0]).length };
        }
        if (normalized.includes("from research_cache")) {
          const database = getDatabase();
          const cached = database.cache.get(values[0]);
          return cached && cached.expiresAt > values[1]
            ? { payloadJson: cached.payloadJson }
            : null;
        }
        return null;
      },
      async all() {
        if (!normalized.includes("from customer_events")) return { results: [] };
        const database = getDatabase();
        return {
          results: database.events
            .slice()
            .reverse()
            .slice(0, values[0])
            .map((event) => ({
              id: event.id,
              type: event.type,
              productId: event.productId,
              blockId: event.blockId,
              well: event.well,
              at: event.at
            }))
        };
      },
      async run() {
        const database = getDatabase();
        if (normalized.includes("insert into campaign_publications")) {
          database.campaign = values[1];
        } else if (normalized.includes("insert into customer_events")) {
          database.events.push({
            id: values[0],
            campaignId: values[1],
            type: values[2],
            productId: values[3],
            blockId: values[4],
            well: values[5],
            at: values[6]
          });
        } else if (normalized.includes("insert into research_cache")) {
          database.cache.set(values[0], {
            payloadJson: values[1],
            expiresAt: values[2]
          });
        }
        return { success: true };
      }
    };
  }
}

const fakeDatabase = new FakeD1();

async function requestWorker(
  pathname = "/",
  init = { headers: { accept: "text/html" } },
  authenticated = true
) {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}-${pathname}`);
  const { default: worker } = await import(workerUrl.href);
  const requestHeaders = new Headers(init.headers);
  if (authenticated) {
    requestHeaders.set("oai-authenticated-user-email", TEST_OPERATOR_EMAIL);
  }
  return worker.fetch(
    new Request(`http://localhost${pathname}`, { ...init, headers: requestHeaders }),
    {
      ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) },
      DB: fakeDatabase
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
  const block = campaign.blocks.find((entry) => entry.productIds?.includes(product.id));
  const eventResponse = await requestWorker("/api/events", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      type: "purchase",
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
