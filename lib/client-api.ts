import type {
  BannerResponse,
  Draft,
  DraftAssemblyRequest,
  ResearchPayload,
  Well
} from "@/lib/types";

type ApiErrorPayload = {
  message?: string;
  nextAction?: string;
};

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new Error("서버 응답을 읽지 못했습니다. 잠시 후 다시 시도해 주세요.");
  }

  if (!response.ok) {
    const error = payload as ApiErrorPayload;
    throw new Error(
      [error.message || "요청을 처리하지 못했습니다.", error.nextAction]
        .filter(Boolean)
        .join(" ")
    );
  }

  return payload as T;
}

export function requestResearch(request: string, well: Well) {
  return postJson<ResearchPayload>("/api/research", { request, well });
}

export function requestBanner(request: string, well: Well) {
  return postJson<BannerResponse>("/api/generate-banner", { request, well });
}

export async function assembleDraft(input: DraftAssemblyRequest) {
  const payload = await postJson<{ draft: Draft }>("/api/assemble-draft", input);
  return payload.draft;
}
