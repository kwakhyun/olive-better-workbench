import { mkdir, writeFile } from "node:fs/promises";

const wells = [
  {
    well: "Eat Well",
    category: "푸드 & 이너밸런스",
    functions: ["digestive_health", "energy_metabolism", "blood_sugar_balance"],
    nouns: ["그린 파이버", "밸런스 효소", "데일리 유산균", "오트 에너지", "콤부차"],
    tags: ["가벼운 식사", "장 건강", "데일리 루틴", "저당"]
  },
  {
    well: "Nourish Well",
    category: "비타민 & 뉴트리션",
    functions: ["vitamin_mineral", "immunity", "antioxidant"],
    nouns: ["멀티 비타민", "비타 C 구미", "미네랄 밸런스", "데일리 아연", "항산화 베리"],
    tags: ["기초 영양", "비타민", "활력", "간편 섭취"]
  },
  {
    well: "Fit Well",
    category: "액티브 뉴트리션",
    functions: ["muscle_function", "exercise_performance", "bone_health"],
    nouns: ["액티브 프로틴", "마그네슘 샷", "조인트 서포트", "BCAA 워터", "본 밸런스"],
    tags: ["운동 루틴", "단백질", "회복", "액티브"]
  },
  {
    well: "Relax Well",
    category: "릴랙스 & 슬립",
    functions: ["sleep_health", "stress_relief", "relaxation"],
    nouns: ["나이트 티", "릴랙스 구미", "테아닌 밸런스", "슬립 아로마", "카밍 마그네슘"],
    tags: ["저녁 루틴", "휴식", "숙면 환경", "마음챙김"]
  },
  {
    well: "Glow Well",
    category: "이너뷰티",
    functions: ["skin_health", "antioxidant", "collagen"],
    nouns: ["글로우 콜라겐", "히알 워터", "뷰티 바이오틱스", "비오틴 구미", "세라마이드 샷"],
    tags: ["이너뷰티", "수분", "탄력", "글로우"]
  },
  {
    well: "Care Well",
    category: "데일리 케어",
    functions: ["eye_health", "oral_health", "liver_health", "joint_health"],
    nouns: ["아이 루테인", "오랄 프로바이오틱스", "밀크시슬 밸런스", "관절 케어", "오메가 밸런스"],
    tags: ["눈 건강", "구강 케어", "일상 관리", "가족 건강"]
  }
];

const brands = ["베러랩", "그로브", "누아", "밸런스온", "플로우데이", "모먼트"];
const forms = ["파우치", "스틱", "보틀", "구미", "정", "드링크"];
const colors = ["#E8F0C7", "#E8DDF2", "#F4C97A", "#CFE9DF", "#F6DDD4", "#DCE6F4"];
const products = [];

for (let index = 0; index < 300; index += 1) {
  const meta = wells[index % wells.length];
  const series = Math.floor(index / wells.length);
  const duplicate = index > 0 && index % 23 === 0;
  const previous = products[index - 1];
  const mismatch = index % 29 === 0;
  const missingFunctional = index % 19 === 0;
  const outOfStock = index % 17 === 0;
  const functional = missingFunctional
    ? []
    : [
        mismatch
          ? wells[(index + 1) % wells.length].functions[0]
          : meta.functions[series % meta.functions.length]
      ];

  products.push({
    id: `P${String(index + 1).padStart(4, "0")}`,
    sku: duplicate ? previous.sku : `SKU-${String(index + 1).padStart(4, "0")}`,
    canonicalSku: duplicate ? previous.canonicalSku : `CAN-${String(index + 1).padStart(4, "0")}`,
    name: duplicate
      ? `${previous.name} `
      : `${brands[series % brands.length]} ${meta.nouns[series % meta.nouns.length]} ${10 + (series % 20)}일분`,
    brand: brands[series % brands.length],
    well: meta.well,
    category: meta.category,
    functional,
    price: 8900 + ((index * 1700) % 32000),
    stock: outOfStock ? 0 : 5 + ((index * 13) % 95),
    rating: Number((4 + ((index * 7) % 10) / 10).toFixed(1)),
    reviewCount: 36 + ((index * 47) % 2100),
    tags: [meta.tags[series % meta.tags.length], meta.tags[(series + 1) % meta.tags.length]],
    flags: {
      coupon: index % 4 === 0,
      hasOptions: index % 7 === 0
    },
    color: colors[index % colors.length],
    form: forms[index % forms.length]
  });
}

await mkdir(new URL("../data/", import.meta.url), { recursive: true });
await writeFile(
  new URL("../data/products.json", import.meta.url),
  `${JSON.stringify(products, null, 2)}\n`
);

console.log(`Generated ${products.length} deterministic demo products.`);
