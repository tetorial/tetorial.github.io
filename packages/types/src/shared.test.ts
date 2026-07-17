// M2C-1 완료 기준: CellPos가 @tetorial/types 공개 API로 승격 — 3중 정의 제거 (#12)
import { describe, expect, it } from "vitest";

import type { CellPos } from "./index.js";

describe("M2C-1 CellPos 공개 승격 (#12)", () => {
  it("M2C-1 공개 API에서 임포트 가능하고 좌표 규약(x·y number)을 갖는다", () => {
    const origin: CellPos = { x: 0, y: 0 }; // x 0=왼쪽, y 0=최하단
    expect(origin).toEqual({ x: 0, y: 0 });
  });
});
