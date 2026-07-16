// BoardRenderer 수용 기준 — RD-1·RD-2·RD-3·RD-5·RD-6·RD-7 (docs/specs/renderer.md §7).
// 그리기 로직은 호출 기록 mock 2D 컨텍스트로 검증(픽셀 스냅샷 아님, 명세 §7).
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import type { BoardRows } from "@tetorial/types";
import { BoardRenderer } from "./board-renderer.js";
import { DEFAULT_THEME } from "./theme.js";
import { asCanvas, MockCanvas, type DrawOp } from "./testing/mock-canvas.js";

/** 전(全) 셀을 채운 보드 (visibleHeight+bufferPeek 행, 각 행 "G"×10). */
function fullBoard(totalRows: number): BoardRows {
  return { width: 10, rows: Array.from({ length: totalRows }, () => "GGGGGGGGGG") };
}

function fillRectsOf(ctx: MockCanvas["ctx"]): Extract<DrawOp, { op: "fillRect" }>[] {
  return ctx.fillRects();
}

describe("RD-1 좌표 왕복 (render가 칠한 사각형 ↔ hitTest 역변환 일치)", () => {
  // cellSize·bufferPeek·dpr 변형 매트릭스 (명세 §3·§7)
  const matrix = [
    { cellSize: 24, visibleHeight: 20, bufferPeek: 2, dpr: 1 },
    { cellSize: 10, visibleHeight: 20, bufferPeek: 0, dpr: 2 },
    { cellSize: 7, visibleHeight: 12, bufferPeek: 3, dpr: 1.5 },
    { cellSize: 16, visibleHeight: 6, bufferPeek: 1, dpr: 3 },
  ];

  for (const { cellSize, visibleHeight, bufferPeek, dpr } of matrix) {
    const totalRows = visibleHeight + bufferPeek;
    it(`cs=${cellSize} peek=${bufferPeek} dpr=${dpr}: 전 셀 왕복 + 경계 + 보드 밖 null`, () => {
      const canvas = new MockCanvas();
      const r = new BoardRenderer(asCanvas(canvas), { cellSize, visibleHeight, bufferPeek });
      r.resize(10 * cellSize, totalRows * cellSize, dpr);
      r.render({ board: fullBoard(totalRows) });

      // 셀 fillRect(간격 반영 w=cellSize-1)만 추출해 좌표→키 집합으로.
      const cellKeys = new Set(
        fillRectsOf(canvas.ctx)
          .filter((o) => o.w === cellSize - 1)
          .map((o) => `${o.x},${o.y}`),
      );

      for (let x = 0; x < 10; x++) {
        for (let y = 0; y < totalRows; y++) {
          const px = x * cellSize;
          const py = (visibleHeight + bufferPeek - 1 - y) * cellSize;
          // (a) render가 §3 수식 위치에 칠했다
          expect(cellKeys.has(`${px},${py}`)).toBe(true);
          // (b) 그 사각형 내부점 → hitTest가 같은 셀로 역변환
          const inside = r.hitTest(px + (cellSize - 1) / 2, py + (cellSize - 1) / 2);
          expect(inside).toEqual({ x, y });
          // (c) 좌상단 경계점도 같은 셀
          expect(r.hitTest(px, py)).toEqual({ x, y });
        }
      }

      // 보드 밖 → null
      expect(r.hitTest(-1, 5)).toBeNull();
      expect(r.hitTest(5, -1)).toBeNull();
      expect(r.hitTest(10 * cellSize, 5)).toBeNull(); // col=10
      expect(r.hitTest(5, totalRows * cellSize)).toBeNull(); // rowFromTop=totalRows → y<0
    });
  }

  it("우측·하단 경계 직전 픽셀은 마지막 유효 셀에 속한다", () => {
    const canvas = new MockCanvas();
    const r = new BoardRenderer(asCanvas(canvas), { cellSize: 20, visibleHeight: 20, bufferPeek: 2 });
    // x=9 열의 우측 경계 직전
    expect(r.hitTest(10 * 20 - 0.001, 30)).toEqual({ x: 9, y: expect.any(Number) });
    // 최하단 행(rowFromTop=totalRows-1 → y=0) 직전
    const bottomPy = (22 - 1) * 20;
    expect(r.hitTest(0, bottomPy + 0.001)).toEqual({ x: 0, y: 0 });
  });
});

describe("RD-2 셀 전수 (fillStyle·레이어 순서·D≠G·미지 문자)", () => {
  it("_/G/D/7미노 각 셀의 fillStyle과 D≠G 색 구분", () => {
    const canvas = new MockCanvas();
    const r = new BoardRenderer(asCanvas(canvas));
    // x: 0="_" 1="G" 2="D" 3="I" 4="J" 5="L" 6="O" 7="S" 8="T" 9="Z"
    const board: BoardRows = { width: 10, rows: ["_GDIJLOSTZ"] };
    r.render({ board });

    const cellSize = 24;
    const y0py = (20 + 2 - 1 - 0) * cellSize; // y=0 행의 py
    const cellAt = (x: number) =>
      fillRectsOf(canvas.ctx).find((o) => o.x === x * cellSize && o.y === y0py && o.w === cellSize - 1);

    // "_"는 셀 채움 없음(배경만)
    expect(cellAt(0)).toBeUndefined();
    // 각 문자 → 테마 색
    const expected: Record<number, string> = {
      1: DEFAULT_THEME.cell["G"]!,
      2: DEFAULT_THEME.cell["D"]!,
      3: DEFAULT_THEME.cell["I"]!,
      4: DEFAULT_THEME.cell["J"]!,
      5: DEFAULT_THEME.cell["L"]!,
      6: DEFAULT_THEME.cell["O"]!,
      7: DEFAULT_THEME.cell["S"]!,
      8: DEFAULT_THEME.cell["T"]!,
      9: DEFAULT_THEME.cell["Z"]!,
    };
    for (const [x, color] of Object.entries(expected)) {
      expect(cellAt(Number(x))?.fillStyle).toBe(color);
    }
    // D ≠ G
    expect(cellAt(2)!.fillStyle).not.toBe(cellAt(1)!.fillStyle);
    // D는 테두리(strokeRect) 있음
    const dStroke = canvas.ctx.ops.find(
      (o) => o.op === "strokeRect" && o.strokeStyle === DEFAULT_THEME.dummyBorder,
    );
    expect(dStroke).toBeDefined();
  });

  it("레이어 순서: 배경 → (격자) → 보드 셀 → 하이라이트 오버레이", () => {
    const canvas = new MockCanvas();
    const r = new BoardRenderer(asCanvas(canvas));
    r.render({
      board: { width: 10, rows: ["GGGGGGGGGG"] },
      overlays: { highlights: ["_____H____"] },
    });
    const ops = canvas.ctx.ops;
    const bgIdx = ops.findIndex((o) => o.op === "fillRect" && o.fillStyle === DEFAULT_THEME.background);
    const cellIdx = ops.findIndex((o) => o.op === "fillRect" && o.fillStyle === DEFAULT_THEME.cell["G"]);
    const hlIdx = ops.findIndex((o) => o.op === "fillRect" && o.fillStyle === DEFAULT_THEME.highlight);
    expect(bgIdx).toBeGreaterThanOrEqual(0);
    expect(cellIdx).toBeGreaterThan(bgIdx);
    expect(hlIdx).toBeGreaterThan(cellIdx); // 하이라이트는 항상 셀 위
  });

  it("하이라이트는 물리 무관 — 빈 칸 위에도 그린다", () => {
    const canvas = new MockCanvas();
    const r = new BoardRenderer(asCanvas(canvas));
    r.render({ board: { width: 10, rows: [] }, overlays: { highlights: ["H_________"] } });
    const hl = fillRectsOf(canvas.ctx).find((o) => o.fillStyle === DEFAULT_THEME.highlight);
    expect(hl).toBeDefined();
  });

  it("미지의 행 문자 → D 처리 + 심볼당 최초 1회 console.warn (전방 호환)", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const canvas = new MockCanvas();
      const r = new BoardRenderer(asCanvas(canvas));
      r.render({ board: { width: 10, rows: ["?____?____"] } }); // 같은 심볼 2회 → 경고 1회
      const cellSize = 24;
      const y0py = (20 + 2 - 1) * cellSize;
      const unknown = fillRectsOf(canvas.ctx).find((o) => o.x === 0 && o.y === y0py && o.w === cellSize - 1);
      expect(unknown?.fillStyle).toBe(DEFAULT_THEME.cell["D"]);
      expect(warn).toHaveBeenCalledTimes(1);
      expect(warn.mock.calls[0]?.[0]).toContain("?");
    } finally {
      warn.mockRestore();
    }
  });
});

describe("RD-3 미노 레이어 (falling·ghost 구분·클리핑·falling 없는 프레임)", () => {
  it("falling(솔리드 미노색)과 ghost(반투명+외곽선) 스타일이 구분된다", () => {
    const canvas = new MockCanvas();
    const r = new BoardRenderer(asCanvas(canvas));
    r.render({
      board: { width: 10, rows: [] },
      falling: { type: "T", cells: [{ x: 4, y: 0 }] },
      ghost: [{ x: 4, y: 1 }],
    });
    const ff = fillRectsOf(canvas.ctx);
    expect(ff.some((o) => o.fillStyle === DEFAULT_THEME.cell["T"])).toBe(true);
    expect(ff.some((o) => o.fillStyle === DEFAULT_THEME.ghostFill)).toBe(true);
    // ghost는 외곽선 있음, falling은 (미노 셀) 외곽선 없음
    expect(canvas.ctx.ops.some((o) => o.op === "strokeRect" && o.strokeStyle === DEFAULT_THEME.ghostStroke)).toBe(true);
  });

  it("버퍼 peek 위(y ≥ visibleHeight+bufferPeek) 셀은 클리핑되어 그려지지 않는다", () => {
    const canvas = new MockCanvas();
    const r = new BoardRenderer(asCanvas(canvas), { cellSize: 20, visibleHeight: 20, bufferPeek: 2 });
    // totalRows=22. rows[24]에 셀 → y=24 클리핑. falling y=30도 클리핑.
    const rows = Array.from({ length: 25 }, (_, i) => (i === 24 ? "GGGGGGGGGG" : "__________"));
    r.render({ board: { width: 10, rows }, falling: { type: "I", cells: [{ x: 0, y: 30 }] } });
    const ff = fillRectsOf(canvas.ctx).filter((o) => o.w === 20 - 1);
    // 클리핑 대상 외 실제 그려진 셀 없음(모두 빈 칸/범위 밖)
    expect(ff.length).toBe(0);
  });

  it("falling 없는 프레임(페이지 뷰)도 정상 렌더", () => {
    const canvas = new MockCanvas();
    const r = new BoardRenderer(asCanvas(canvas));
    expect(() => r.render({ board: { width: 10, rows: ["GGGGGGGGGG"] } })).not.toThrow();
    expect(fillRectsOf(canvas.ctx).some((o) => o.fillStyle === DEFAULT_THEME.cell["G"])).toBe(true);
  });
});

describe("RD-5 결정론·DPR", () => {
  it("동일 프레임 2회 렌더 → 호출 기록 동일", () => {
    const canvas = new MockCanvas();
    const r = new BoardRenderer(asCanvas(canvas));
    const frame = {
      board: { width: 10 as const, rows: ["GDIJLOSTZ_", "TT__SSZZ__"] },
      falling: { type: "T" as const, cells: [{ x: 4, y: 5 }] },
      ghost: [{ x: 4, y: 0 }],
      overlays: { highlights: ["_____H____"] },
    };
    r.render(frame);
    const first = [...canvas.ctx.ops];
    canvas.ctx.ops.length = 0;
    r.render(frame);
    expect(canvas.ctx.ops).toEqual(first);
  });

  it("resize(dpr) 후 transform은 새 dpr, 내부 픽셀=CSS×dpr, hitTest 수학 불변", () => {
    const canvas = new MockCanvas();
    const r = new BoardRenderer(asCanvas(canvas), { cellSize: 20, visibleHeight: 20, bufferPeek: 2 });
    const before = r.hitTest(30, 30);
    r.resize(200, 440, 2.5);
    r.render({ board: { width: 10, rows: [] } });
    const st = canvas.ctx.ops.find((o) => o.op === "setTransform");
    expect(st).toMatchObject({ a: 2.5, d: 2.5 });
    expect(canvas.width).toBe(Math.round(200 * 2.5));
    expect(canvas.height).toBe(Math.round(440 * 2.5));
    // hitTest는 CSS px 기준 — dpr 무관, 동일 결과
    expect(r.hitTest(30, 30)).toEqual(before);
  });
});

describe("RD-6 무결합 (의존성=types뿐·인스턴스 상호 독립·전역 상태 없음)", () => {
  it("package.json 런타임 의존성은 @tetorial/types뿐", () => {
    const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as {
      dependencies?: Record<string, string>;
    };
    expect(Object.keys(pkg.dependencies ?? {})).toEqual(["@tetorial/types"]);
  });

  it("인스턴스 2개는 옵션·출력이 상호 독립이다", () => {
    const cA = new MockCanvas();
    const cB = new MockCanvas();
    const rA = new BoardRenderer(asCanvas(cA), { theme: { background: "#111111" } });
    const rB = new BoardRenderer(asCanvas(cB), { theme: { background: "#222222" } });
    rA.setOptions({ gridLines: false });
    rA.render({ board: { width: 10, rows: [] } });
    rB.render({ board: { width: 10, rows: [] } });
    expect(cA.ctx.ops.some((o) => o.op === "fillRect" && o.fillStyle === "#111111")).toBe(true);
    expect(cB.ctx.ops.some((o) => o.op === "fillRect" && o.fillStyle === "#222222")).toBe(true);
    // A는 격자 끔 → stroke(격자) 없음; B는 기본(격자 있음)
    expect(cA.ctx.ops.some((o) => o.op === "stroke")).toBe(false);
    expect(cB.ctx.ops.some((o) => o.op === "stroke")).toBe(true);
  });

  it("미지 문자 경고는 인스턴스별로 독립 카운트(전역 상태 없음)", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const rA = new BoardRenderer(asCanvas(new MockCanvas()));
      const rB = new BoardRenderer(asCanvas(new MockCanvas()));
      rA.render({ board: { width: 10, rows: ["?_________"] } });
      rA.render({ board: { width: 10, rows: ["?_________"] } }); // 같은 인스턴스 재경고 없음
      expect(warn).toHaveBeenCalledTimes(1);
      rB.render({ board: { width: 10, rows: ["?_________"] } }); // 다른 인스턴스는 자체 1회
      expect(warn).toHaveBeenCalledTimes(2);
    } finally {
      warn.mockRestore();
    }
  });
});

describe("RD-7 테마 (부분 오버라이드·기본 폴백·setOptions 병합)", () => {
  it("부분 오버라이드는 반영되고 미지정 색은 기본 테마로 폴백", () => {
    const canvas = new MockCanvas();
    const r = new BoardRenderer(asCanvas(canvas), { theme: { highlight: "#abcdef" } });
    r.render({ board: { width: 10, rows: ["GGGGGGGGGG"] }, overlays: { highlights: ["H_________"] } });
    const ff = fillRectsOf(canvas.ctx);
    expect(ff.some((o) => o.fillStyle === "#abcdef")).toBe(true); // 오버라이드 반영
    expect(ff.some((o) => o.fillStyle === DEFAULT_THEME.cell["G"])).toBe(true); // G는 기본 폴백
  });

  it("setOptions는 현재 테마 위에 부분 병합(기존 오버라이드 유지)", () => {
    const canvas = new MockCanvas();
    const r = new BoardRenderer(asCanvas(canvas), { theme: { highlight: "#abcdef" } });
    r.setOptions({ theme: { background: "#000000" } });
    r.render({ board: { width: 10, rows: [] }, overlays: { highlights: ["H_________"] } });
    const ff = fillRectsOf(canvas.ctx);
    expect(ff.some((o) => o.fillStyle === "#000000")).toBe(true); // 새 오버라이드
    expect(ff.some((o) => o.fillStyle === "#abcdef")).toBe(true); // 기존 오버라이드 유지
  });

  it("테마 미지정 시 기본 테마 사용", () => {
    const canvas = new MockCanvas();
    const r = new BoardRenderer(asCanvas(canvas));
    r.render({ board: { width: 10, rows: ["GGGGGGGGGG"] } });
    expect(fillRectsOf(canvas.ctx).some((o) => o.fillStyle === DEFAULT_THEME.background)).toBe(true);
  });
});
