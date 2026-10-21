import assert from "node:assert/strict";
import test from "node:test";
import { fetchWithRetry } from "../lib/public-source.mjs";

test("429 응답은 대기 후 한 번 재시도한다", async () => {
  let calls = 0;
  const delays = [];
  const response = await fetchWithRetry("https://example.com/research", {
    source: "테스트 소스",
    retries: 1,
    fetchImpl: async () => {
      calls += 1;
      return calls === 1
        ? new Response("", { status: 429, headers: { "retry-after": "0" } })
        : Response.json({ ok: true });
    },
    sleepImpl: async (ms) => delays.push(ms)
  });

  assert.equal(response.status, 200);
  assert.equal(calls, 2);
  assert.deepEqual(delays, [0]);
});

test("타임아웃 오류를 운영자가 이해할 수 있는 한국어로 바꾼다", async () => {
  await assert.rejects(
    fetchWithRetry("https://example.com/slow", {
      source: "Google News RSS",
      retries: 0,
      fetchImpl: async () => {
        throw new DOMException("The operation was aborted.", "AbortError");
      }
    }),
    /Google News RSS: 응답 시간이 초과되었습니다/
  );
});

test("최종 429 응답에 원문 오류 대신 안전한 안내를 제공한다", async () => {
  await assert.rejects(
    fetchWithRetry("https://example.com/limited", {
      source: "OpenAlex",
      retries: 0,
      fetchImpl: async () => new Response("", { status: 429 })
    }),
    /OpenAlex: 호출량이 많아 잠시 제한되었습니다/
  );
});

function pendingBody(signal) {
  return new Response(new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode('{"partial":'));
      signal.addEventListener("abort", () => controller.error(signal.reason), { once: true });
    }
  }));
}

test("응답 헤더 뒤 본문이 멈춰도 제한 시간에 종료하고 재시도한다", { timeout: 3000 }, async () => {
  let calls = 0;
  let firstSignal;
  const response = await fetchWithRetry("https://example.com/stalled-body", {
    source: "본문 테스트", timeoutMs: 20, retries: 1, sleepImpl: async () => {},
    fetchImpl: async (_url, { signal }) => {
      calls += 1;
      if (calls === 1) { firstSignal = signal; return pendingBody(signal); }
      return Response.json({ ok: true });
    }
  });
  assert.equal(firstSignal.aborted, true);
  assert.equal(calls, 2);
  assert.deepEqual(await response.json(), { ok: true });
});

test("모든 본문 읽기가 시간 초과되면 복구 가능한 최종 실패를 반환한다", { timeout: 3000 }, async () => {
  let calls = 0;
  await assert.rejects(fetchWithRetry("https://example.com/stalled-body", {
    source: "본문 테스트", timeoutMs: 20, retries: 1, sleepImpl: async () => {},
    fetchImpl: async (_url, { signal }) => { calls += 1; return pendingBody(signal); }
  }), /본문 테스트: 응답 시간이 초과되었습니다/);
  assert.equal(calls, 2);
});
