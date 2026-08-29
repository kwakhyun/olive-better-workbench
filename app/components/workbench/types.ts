export type Stage =
  | "idle"
  | "researching"
  | "curating"
  | "generating"
  | "review"
  | "published";

export type Panel = "evidence" | "safety" | "json";

export const STAGE_LABELS: Record<Stage, string> = {
  idle: "기획 요청 대기",
  researching: "공개 트렌드 조사 중",
  curating: "트렌드와 상품 정리 중",
  generating: "안전한 대표 문구 생성 중",
  review: "검토 준비 완료",
  published: "발행 완료"
};
