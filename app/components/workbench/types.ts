export type Stage =
  | "idle"
  | "researching"
  | "curating"
  | "generating"
  | "review"
  | "published";

export type Panel = "evidence" | "safety" | "json";

export const STAGE_LABELS: Record<Stage, string> = {
  idle: "요청 대기",
  researching: "공개 소스 조사 중",
  curating: "신호·상품 정제 중",
  generating: "안전 카피 생성 중",
  review: "검토 가능",
  published: "발행 완료"
};
