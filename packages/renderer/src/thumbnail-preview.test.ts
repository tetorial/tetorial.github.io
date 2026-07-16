// 보조 렌더 수용 기준 — RD-4 (썸네일·미리보기, docs/specs/renderer.md §7).
import { describe, expect, it } from "vitest";
import type { PieceType } from "@tetorial/types";
import { renderPiecePreview, renderThumbnail } from "./board-renderer.js";
import { DEFAULT_THEME } from "./theme.js";
import { asCanvas, installOffscreenStub, MockCanvas } from "./testing/mock-canvas.js";

describe("RD-4 썸네일 (트림된 board 배치·오버레이 포함)", () => {
  it("트림된 board의 rows[0]가 최하단에 배치된다", () => {
    const stub = installOffscreenStub();
    try {
      const cellSize = 8;
      renderThumbnail({ board: { width: 10, rows: ["G_________"] } }, { cellSize });
      const surface = stub.instances[0];
      expect(surface).toBeDefined();
      // y=0(최하단) → py = (visibleHeight-1)*cellSize (썸네일 bufferPeek=0, visibleHeight=20)
      const py = (20 - 1) * cellSize;
      const cell = surface!.ctx.fillRects().find((o) => o.x === 0 && o.y === py && o.w === cellSize - 1);
      expect(cell?.fillStyle).toBe(DEFAULT_THEME.cell["G"]);
    } finally {
      stub.restore();
    }
  });

  it("오버레이 하이라이트를 포함해 그린다", () => {
    const stub = installOffscreenStub();
    try {
      renderThumbnail({ board: { width: 10, rows: [] }, overlays: { highlights: ["H_________"] } });
      const surface = stub.instances[0]!;
      expect(surface.ctx.fillRects().some((o) => o.fillStyle === DEFAULT_THEME.highlight)).toBe(true);
    } finally {
      stub.restore();
    }
  });

  it("falling 없이 페이지 락 결과 상태만 그린다(반환 표면 생성)", () => {
    const stub = installOffscreenStub();
    try {
      const surface = renderThumbnail({ board: { width: 10, rows: ["GGGGGGGGGG"] } });
      expect(surface).toBe(stub.instances[0]);
    } finally {
      stub.restore();
    }
  });
});

describe("RD-4 미리보기 (7미노 산출)", () => {
  const pieces: PieceType[] = ["I", "J", "L", "O", "S", "T", "Z"];
  for (const piece of pieces) {
    it(`${piece} 미리보기 = 4셀, 해당 미노 색`, () => {
      const canvas = new MockCanvas(40, 20);
      renderPiecePreview(piece, asCanvas(canvas));
      const fills = canvas.ctx.fillRects();
      expect(fills).toHaveLength(4); // 미노 셀 4개
      for (const f of fills) {
        expect(f.fillStyle).toBe(DEFAULT_THEME.cell[piece]);
      }
      // 캔버스를 먼저 비운다
      expect(canvas.ctx.ops[0]?.op).toBe("clearRect");
    });
  }

  it("cellSize 지정 시 셀 크기를 따른다", () => {
    const canvas = new MockCanvas(200, 100);
    renderPiecePreview("O", asCanvas(canvas), { cellSize: 12 });
    const fills = canvas.ctx.fillRects();
    expect(fills).toHaveLength(4);
    expect(fills[0]?.w).toBe(12 - 1);
  });
});
