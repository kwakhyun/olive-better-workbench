const WELL_COPY = {
  "Eat Well": {
    eyebrow: "OLIVE BETTER · EAT WELL",
    title: "잘 먹는 하루는, 작은 선택부터",
    subtitle: "최신 공개 신호와 상품 안전 기준을 함께 살펴 고른 균형 있는 식사 루틴이에요.",
    cta: "균형 루틴 둘러보기"
  },
  "Nourish Well": {
    eyebrow: "OLIVE BETTER · NOURISH WELL",
    title: "매일의 균형을 가볍게 채우는 법",
    subtitle: "지금의 관심 신호와 상품 안전 기준을 함께 살펴 고른 데일리 영양 루틴이에요.",
    cta: "영양 루틴 둘러보기"
  },
  "Fit Well": {
    eyebrow: "OLIVE BETTER · FIT WELL",
    title: "움직이는 하루를 위한 가벼운 루틴",
    subtitle: "최신 공개 신호와 상품 안전 기준을 함께 살펴 고른 움직임과 회복 루틴이에요.",
    cta: "움직임 루틴 보기"
  },
  "Relax Well": {
    eyebrow: "OLIVE BETTER · RELAX WELL",
    title: "잘 쉬는 저녁은, 작은 리듬에서",
    subtitle: "오늘의 휴식 신호와 상품 안전 기준을 함께 살펴 고른 차분한 저녁 루틴이에요.",
    cta: "휴식 루틴 둘러보기"
  },
  "Glow Well": {
    eyebrow: "OLIVE BETTER · GLOW WELL",
    title: "매일의 생기를 채우는 이너 루틴",
    subtitle: "지금의 관심 신호와 상품 안전 기준을 함께 살펴 고른 데일리 생기 루틴이에요.",
    cta: "생기 루틴 둘러보기"
  },
  "Care Well": {
    eyebrow: "OLIVE BETTER · CARE WELL",
    title: "가까운 일상부터 시작하는 케어",
    subtitle: "생활 속 관심 신호와 상품 안전 기준을 함께 살펴 고른 부담 없는 케어 루틴이에요.",
    cta: "케어 루틴 둘러보기"
  }
};

const CONTEXT_TITLES = [
  {
    pattern: /장마|비 오는|비오는|습한|우기/,
    title: "비 오는 날에도, 내 리듬은 가볍게"
  },
  {
    pattern: /출근|아침|모닝/,
    title: "아침의 작은 선택이 만드는 좋은 리듬"
  },
  {
    pattern: /저녁|밤|나이트|퇴근/,
    title: "오늘을 잘 마무리하는 작은 루틴"
  },
  {
    pattern: /초보|처음|입문|시작/,
    title: "처음이라 더 가볍게, 나다운 루틴"
  }
];

function trimText(value, maxLength) {
  return String(value ?? "").trim().slice(0, maxLength);
}

export function generateSafeBanner({ request = "", well = "Nourish Well" } = {}) {
  const base = WELL_COPY[well] ?? WELL_COPY["Nourish Well"];
  const context = CONTEXT_TITLES.find((item) => item.pattern.test(String(request)));
  return {
    eyebrow: trimText(base.eyebrow, 30),
    title: trimText(context?.title ?? base.title, 28),
    subtitle: trimText(base.subtitle, 58),
    cta: trimText(base.cta, 14)
  };
}

export const SAFE_COPY_ENGINE = "OLIVE BETTER Safe Copy Engine v1";
