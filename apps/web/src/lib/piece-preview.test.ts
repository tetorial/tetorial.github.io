import { describe, it, expect } from "vitest";
import type { PieceType } from "@tetorial/types";
import { NEXT_PREVIEW_COUNT, holdPreview, nextPreviewSlice } from "./piece-preview.js";

const QUEUE: PieceType[] = ["I", "J", "L", "O", "S", "T", "Z"];

describe("AW-18 Next·Hold 프리뷰 계산부", () => {
  it("AW-18 넥스트는 표시 상한만큼 앞에서 자른다", () => {
    expect(nextPreviewSlice(QUEUE)).toEqual(["I", "J", "L", "O", "S"]);
    expect(nextPreviewSlice(QUEUE).length).toBe(NEXT_PREVIEW_COUNT);
    expect(nextPreviewSlice(QUEUE, 3)).toEqual(["I", "J", "L"]);
  });

  it("AW-18 큐가 상한보다 짧으면 있는 만큼만(패딩 없음)", () => {
    expect(nextPreviewSlice(["I", "J"])).toEqual(["I", "J"]);
    expect(nextPreviewSlice([])).toEqual([]);
    expect(nextPreviewSlice(QUEUE, 0)).toEqual([]);
  });

  it("AW-18 넥스트 슬라이스는 원본을 변형하지 않는다", () => {
    const queue = [...QUEUE];
    nextPreviewSlice(queue).push("I");
    expect(queue).toEqual(QUEUE);
  });

  it("AW-18 홀드는 비었으면 null, 있으면 조각 + 잠김 여부", () => {
    expect(holdPreview({ piece: null, locked: false })).toBeNull();
    expect(holdPreview({ piece: null, locked: true })).toBeNull();
    expect(holdPreview({ piece: "T", locked: false })).toEqual({ piece: "T", locked: false });
    expect(holdPreview({ piece: "T", locked: true })).toEqual({ piece: "T", locked: true });
  });
});
