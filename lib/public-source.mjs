const RETRYABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function retryAfterMs(response, attempt) {
  const value = response.headers.get("retry-after");
  if (value) {
    const seconds = Number(value);
    if (Number.isFinite(seconds)) return Math.min(Math.max(seconds * 1000, 0), 2000);

    const date = Date.parse(value);
    if (Number.isFinite(date)) return Math.min(Math.max(date - Date.now(), 0), 2000);
  }
  return Math.min(350 * 2 ** attempt, 1400);
}

function sourceError(source, error) {
  if (error instanceof Error && error.name === "AbortError") {
    return new Error(`${source}: 응답 시간이 초과되었습니다.`);
  }
  if (error instanceof Error && error.message.startsWith(`${source}:`)) return error;
  return new Error(`${source}: 네트워크 연결에 실패했습니다.`);
}

export async function fetchWithRetry(
  url,
  {
    source,
    timeoutMs = 10000,
    retries = 1,
    headers = {},
    fetchImpl = fetch,
    sleepImpl = wait
  }
) {
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let response;

    try {
      response = await fetchImpl(url, {
        signal: controller.signal,
        headers,
        cache: "no-store"
      });
      if (response.ok) {
        // Fetch resolves at the headers. Keep the deadline through body consumption.
        const body = await response.arrayBuffer();
        return new Response(body.byteLength ? body : null, {
          status: response.status,
          statusText: response.statusText,
          headers: response.headers
        });
      }
      await response.body?.cancel();
    } catch (error) {
      const normalized = sourceError(source, error);
      if (attempt < retries) {
        await sleepImpl(Math.min(350 * 2 ** attempt, 1400));
        continue;
      }
      throw normalized;
    } finally {
      clearTimeout(timer);
    }

    const message =
      response.status === 429
        ? `${source}: 호출량이 많아 잠시 제한되었습니다.`
        : response.status >= 500
          ? `${source}: 일시적인 서버 오류가 발생했습니다.`
          : `${source}: 요청을 처리하지 못했습니다. (HTTP ${response.status})`;

    if (RETRYABLE_STATUS.has(response.status) && attempt < retries) {
      await sleepImpl(retryAfterMs(response, attempt));
      continue;
    }
    throw new Error(message);
  }

  throw new Error(`${source}: 연결에 실패했습니다.`);
}
