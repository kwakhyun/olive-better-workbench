import http from "node:http";

const port = Number(process.env.MOCK_LLM_PORT || 4178);

const server = http.createServer(async (request, response) => {
  const requestUrl = new URL(request.url ?? "/", `http://127.0.0.1:${port}`);
  if (request.method === "GET" && requestUrl.pathname === "/google-news") {
    response.writeHead(200, { "content-type": "application/rss+xml; charset=utf-8" });
    response.end(`<?xml version="1.0" encoding="UTF-8"?><rss><channel>
      <item><title>장마철 직장인 사이에서 짧은 아침 운동 루틴 관심 증가</title><link>https://example.com/trend/1</link><pubDate>Wed, 29 Jul 2026 01:00:00 GMT</pubDate></item>
      <item><title>러닝 초보가 주목하는 단백질과 회복 중심의 웰니스 루틴</title><link>https://example.com/trend/2</link><pubDate>Tue, 28 Jul 2026 08:00:00 GMT</pubDate></item>
      <item><title>출근 전 10분, 지속 가능한 컨디션 관리가 새로운 습관으로</title><link>https://example.com/trend/3</link><pubDate>Mon, 27 Jul 2026 02:00:00 GMT</pubDate></item>
      <item><title>광고 쿠폰 코드로 만나는 기적의 운동 보조제</title><link>https://example.com/ad</link><pubDate>Mon, 27 Jul 2026 02:00:00 GMT</pubDate></item>
    </channel></rss>`);
    return;
  }

  if (request.method === "GET" && requestUrl.pathname === "/openalex") {
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({
      results: [
        {
          id: "https://openalex.org/W1",
          title: "Brief morning exercise and perceived energy among office workers",
          publication_date: "2026-07-24",
          doi: "https://doi.org/10.1000/demo-1",
          primary_location: { landing_page_url: "https://example.com/research/1" }
        },
        {
          id: "https://openalex.org/W2",
          title: "Protein intake patterns and recovery habits in novice runners",
          publication_date: "2026-07-21",
          doi: "https://doi.org/10.1000/demo-2",
          primary_location: { landing_page_url: "https://example.com/research/2" }
        },
        {
          id: "https://openalex.org/W3",
          title: "Daily wellness routines and sustainable behavior formation",
          publication_date: "2026-07-18",
          doi: "https://doi.org/10.1000/demo-3",
          primary_location: { landing_page_url: "https://example.com/research/3" }
        }
      ]
    }));
    return;
  }

  if (request.method !== "POST" || request.url !== "/v1/chat/completions") {
    response.writeHead(404);
    response.end("Not found");
    return;
  }

  let body = "";
  for await (const chunk of request) body += chunk;
  const payload = JSON.parse(body);
  const prompt = payload.messages?.at(-1)?.content ?? "";
  const isRelax = prompt.includes("Relax Well") || prompt.includes("저녁");
  const content = isRelax
    ? {
        eyebrow: "OLIVE BETTER · EVENING EDIT",
        title: "잘 쉬는 저녁은, 작은 리듬에서",
        subtitle: "오늘의 휴식 신호와 안전 기준을 함께 살펴 고른 차분한 나이트 루틴이에요.",
        cta: "저녁 루틴 둘러보기"
      }
    : {
        eyebrow: "OLIVE BETTER · RAINY SEASON",
        title: "비 오는 날에도, 내 리듬은 가볍게",
        subtitle: "출근 전 짧은 순간에 더하는 안전하고 간결한 웰니스 루틴을 만나보세요.",
        cta: "아침 루틴 시작하기"
      };

  response.writeHead(200, { "content-type": "application/json" });
  response.end(
    JSON.stringify({
      id: "chatcmpl-cofathon-test",
      choices: [{ message: { role: "assistant", content: JSON.stringify(content) } }]
    })
  );
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Mock LLM listening on http://127.0.0.1:${port}`);
});
