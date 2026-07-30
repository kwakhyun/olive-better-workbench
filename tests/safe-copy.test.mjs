import assert from "node:assert/strict";
import test from "node:test";
import { generateSafeBanner, SAFE_COPY_ENGINE } from "../lib/safe-copy.mjs";
import { inspectCopy } from "../lib/engine.mjs";
import rules from "../data/rules.json" with { type: "json" };

const wells = [
  "Eat Well",
  "Nourish Well",
  "Fit Well",
  "Relax Well",
  "Glow Well",
  "Care Well"
];

test("6대 Well마다 키 없이 안전한 대표 배너 문구를 만든다", () => {
  for (const well of wells) {
    const banner = generateSafeBanner({
      request: "매일 이어갈 수 있는 웰니스 루틴",
      well
    });
    assert.ok(banner.eyebrow);
    assert.ok(banner.title);
    assert.ok(banner.subtitle);
    assert.ok(banner.cta);
    assert.ok(banner.title.length <= 28);
    assert.ok(banner.subtitle.length <= 58);
    assert.ok(banner.cta.length <= 14);
    assert.equal(
      inspectCopy(Object.values(banner).join(" "), rules).safe,
      true,
      `${well} 문구가 안전 검사를 통과해야 합니다.`
    );
  }
});

test("요청의 시간·상황 맥락을 통제된 제목으로 반영한다", () => {
  const rainy = generateSafeBanner({
    request: "장마철 직장인의 출근 전 루틴",
    well: "Fit Well"
  });
  const evening = generateSafeBanner({
    request: "퇴근 후 차분한 저녁 루틴",
    well: "Relax Well"
  });

  assert.equal(rainy.title, "비 오는 날에도, 내 리듬은 가볍게");
  assert.equal(evening.title, "오늘을 잘 마무리하는 작은 루틴");
  assert.notEqual(rainy.cta, evening.cta);
});

test("사용자 입력의 위험 문구를 배너에 그대로 복사하지 않는다", () => {
  const banner = generateSafeBanner({
    request: "질병 치료 100% 효과를 강조",
    well: "Nourish Well"
  });
  assert.doesNotMatch(Object.values(banner).join(" "), /질병|치료|100% 효과/);
  assert.equal(inspectCopy(Object.values(banner).join(" "), rules).safe, true);
  assert.match(SAFE_COPY_ENGINE, /Safe Copy Engine/);
});
