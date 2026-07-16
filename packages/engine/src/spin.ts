// 스핀 판정 — 부록 §5 (원문 #detectSpin·#detectSpinFromCorners·isAllSpinPosition) 전사
import type { PieceType } from "@tetorial/types";
import { isLegal, isOccupied } from "./board.js";
import { CORNER_TABLE, SPINBONUS_RULES } from "./data.js";
import type { KickTableName } from "./data.js";
import { pieceCells, toSymbol } from "./piece.js";
import type { Cell, Rot, SpinBonusMode } from "./types.js";

export type Spin = "none" | "mini" | "normal";

const SPIN_SCORE: Record<Spin, number> = { none: 0, mini: 1, normal: 2 };

function maxSpin(a: Spin, b: Spin): Spin {
  return SPIN_SCORE[b] >= SPIN_SCORE[a] ? b : a;
}

/** 코너 판정 (부록 §5-2). T 계열(types_mini) 전용 — 호출측이 피스를 거른다 */
function detectSpinFromCorners(
  board: readonly (readonly Cell[])[],
  table: KickTableName,
  mode: SpinBonusMode,
  piece: PieceType,
  rot: Rot,
  x: number,
  y: number,
  finOrTst: boolean,
): Spin {
  // 1. 한 칸 아래가 합법이면 접지 아님 → none
  if (isLegal(board, pieceCells(table, piece, rot, x, y - 1))) return "none";
  const entries = CORNER_TABLE.get(toSymbol(piece))?.[rot];
  if (!entries) return "none";
  let corners = 0;
  let frontCorners = 0;
  for (const e of entries) {
    // 2. 점유(x + table[i][0] + 1, y − table[i][1] − 1) — 보드 밖도 점유
    if (isOccupied(board, x + e.dx + 1, y - e.dy - 1)) {
      corners++;
      if (e.frontRots.includes(rot)) frontCorners++;
    }
  }
  if (corners < 3) return "none";
  let spin: Spin = "normal";
  if (SPINBONUS_RULES[mode].typesMini.includes(toSymbol(piece)) && frontCorners !== 2) {
    spin = "mini";
  }
  if (finOrTst) spin = "normal"; // 5. TST/fin 킥 승격 (부록 §5-3)
  return spin;
}

/** Immobility (부록 §5-4): 상하좌우 1칸 이동이 전부 불법이면 all-spin 위치 */
function isAllSpinPosition(
  board: readonly (readonly Cell[])[],
  table: KickTableName,
  piece: PieceType,
  rot: Rot,
  x: number,
  y: number,
): boolean {
  return (
    !isLegal(board, pieceCells(table, piece, rot, x - 1, y)) &&
    !isLegal(board, pieceCells(table, piece, rot, x + 1, y)) &&
    !isLegal(board, pieceCells(table, piece, rot, x, y + 1)) &&
    !isLegal(board, pieceCells(table, piece, rot, x, y - 1))
  );
}

/** 회전 성공 직후 호출되는 스핀 판정 (부록 §5-1 모드 분기) */
export function detectSpin(
  board: readonly (readonly Cell[])[],
  table: KickTableName,
  mode: SpinBonusMode,
  piece: PieceType,
  rot: Rot,
  x: number,
  y: number,
  finOrTst: boolean,
): Spin {
  const tSpin =
    toSymbol(piece) === "t"
      ? detectSpinFromCorners(board, table, mode, piece, rot, x, y, finOrTst)
      : "none";
  switch (mode) {
    case "T-spins":
      return tSpin;
    case "all-mini+":
      return maxSpin(tSpin, isAllSpinPosition(board, table, piece, rot, x, y) ? "mini" : "none");
  }
}
