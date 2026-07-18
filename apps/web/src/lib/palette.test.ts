import { describe, it, expect } from "vitest";
import {
  PALETTE_CELLS,
  cellToTool,
  eyedropperPick,
  snapToCellOrigin,
  strokeToolFor,
  withAlpha,
} from "./palette.js";

describe("AW-30 셀 팔레트 — 항목 목록·선택→Tool 매핑", () => {
  it("AW-30 팔레트는 G·D·미노 7종 9개, 이 순서", () => {
    expect(PALETTE_CELLS).toEqual(["G", "D", "I", "J", "L", "O", "S", "T", "Z"]);
  });

  it("AW-30 선택값이 그대로 cell Tool의 v로 들어간다 (하드코딩 없음)", () => {
    for (const v of PALETTE_CELLS) {
      expect(cellToTool(v)).toEqual({ kind: "cell", v });
    }
  });
});

describe("AW-31 고스트 프리뷰 — CSS px 스냅 계산", () => {
  it("AW-31 셀 내부 임의 위치는 셀 좌상단으로 스냅한다", () => {
    expect(snapToCellOrigin(0, 0, 26)).toEqual({ left: 0, top: 0 });
    expect(snapToCellOrigin(25, 25, 26)).toEqual({ left: 0, top: 0 });
    expect(snapToCellOrigin(26, 26, 26)).toEqual({ left: 26, top: 26 });
    expect(snapToCellOrigin(5 * 26 + 13, 8 * 26 + 1, 26)).toEqual({ left: 130, top: 208 });
  });

  it("AW-31 고스트 알파는 0.4~0.6 범위 안", () => {
    expect(withAlpha("#6d6d6d", 0.5)).toBe("rgba(109, 109, 109, 0.5)");
  });
});

describe("AW-32 우클릭 지우기 — (도구, 버튼)→스트로크 Tool 매핑", () => {
  it("AW-32 좌클릭(button 0)은 현행 도구 동작 불변", () => {
    expect(strokeToolFor("cell", 0, "T")).toEqual({ kind: "cell", v: "T" });
    expect(strokeToolFor("erase", 0, "T")).toEqual({ kind: "erase" });
    expect(strokeToolFor("highlight", 0, "T")).toEqual({ kind: "highlight" });
  });

  it("AW-32 우클릭(button 2): cell·erase → erase, highlight → force:off", () => {
    expect(strokeToolFor("cell", 2, "T")).toEqual({ kind: "erase" });
    expect(strokeToolFor("erase", 2, "T")).toEqual({ kind: "erase" });
    expect(strokeToolFor("highlight", 2, "T")).toEqual({ kind: "highlight", force: "off" });
  });

  it("AW-32 그 외 버튼(휠클릭 등)은 스트로크가 아니다", () => {
    expect(strokeToolFor("cell", 1, "T")).toBeNull();
    expect(strokeToolFor("erase", 1, "T")).toBeNull();
    expect(strokeToolFor("highlight", 1, "T")).toBeNull();
  });
});

describe("AW-33 휠클릭 스포이드 — 셀 값→선택/무시 판정", () => {
  it("AW-33 빈 칸(_)은 무시(null)", () => {
    expect(eyedropperPick("_")).toBeNull();
  });

  it("AW-33 G·D·미노 7종은 그 값을 그대로 반환(팔레트 반영 + cell 도구 전환은 호출자 몫)", () => {
    for (const v of PALETTE_CELLS) {
      expect(eyedropperPick(v)).toBe(v);
    }
  });
});
