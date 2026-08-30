import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { imageSize } from "image-size";

test("신뢰한 PNG 메타데이터만 제한된 파서로 읽는다", async () => {
  const image = await readFile(new URL("../public/og.png", import.meta.url));
  assert.deepEqual(imageSize(image), { width: 1731, height: 909, type: "png" });
  assert.throws(
    () => imageSize(new Uint8Array([0, 0, 0, 0])),
    /trusted PNG metadata assets/
  );
});
