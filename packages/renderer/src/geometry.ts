// 좌표 변환 — 명세 §3 (규범). render가 칠한 사각형과 hitTest 역변환은 항상 일치해야 한다(RD-1).
import type { CellPos } from "./types.js";

/** 보드 폭은 스키마상 항상 10 (BoardRows.width). */
export const BOARD_WIDTH = 10;

/** 그리기·히트테스트에 필요한 기하 파라미터. */
export type Geometry = {
  cellSize: number;
  visibleHeight: number;
  bufferPeek: number;
};

/** 그려지는 총 행 수 = 가시 영역 + 버퍼 peek. y ∈ [0, totalRows-1]만 가시(그 위는 클리핑). */
export function totalRows(geo: Geometry): number {
  return geo.visibleHeight + geo.bufferPeek;
}

/**
 * 셀 (x, y)의 캔버스 사각형 좌상단 (CSS px). 명세 §3 수식:
 *   px = x * cellSize
 *   py = (visibleHeight + bufferPeek - 1 - y) * cellSize
 * DPR 스케일은 컨텍스트 transform에서 처리하므로 여기서는 CSS px 좌표만 낸다.
 */
export function cellRect(geo: Geometry, x: number, y: number): { px: number; py: number; size: number } {
  return {
    px: x * geo.cellSize,
    py: (geo.visibleHeight + geo.bufferPeek - 1 - y) * geo.cellSize,
    size: geo.cellSize,
  };
}

/** 셀이 가시 범위 안(그려지는 영역)인지. 밖이면 render는 클리핑, hitTest는 null. */
export function isVisibleCell(geo: Geometry, x: number, y: number): boolean {
  return x >= 0 && x < BOARD_WIDTH && y >= 0 && y < totalRows(geo);
}

/**
 * CSS px 오프셋 → 논리 셀. cellRect의 정확한 역변환(명세 §3).
 * 보드 밖(음수·폭 초과)이거나 y ≥ visibleHeight+bufferPeek이면 null.
 */
export function hitTest(geo: Geometry, offsetX: number, offsetY: number): CellPos | null {
  if (offsetX < 0 || offsetY < 0) return null;
  const col = Math.floor(offsetX / geo.cellSize);
  const rowFromTop = Math.floor(offsetY / geo.cellSize);
  if (col < 0 || col >= BOARD_WIDTH) return null;
  if (rowFromTop < 0 || rowFromTop >= totalRows(geo)) return null;
  const y = totalRows(geo) - 1 - rowFromTop;
  return { x: col, y };
}
