// 회전·킥 적용 — 부록 §3 (원문 performKick) 규범 알고리즘의 정수 y 구현
import type { PieceType } from "@tetorial/types";
import { isLegal } from "./board.js";
import { KICK_TABLES } from "./data.js";
import type { KickTableName } from "./data.js";
import { pieceCells, toSymbol } from "./piece.js";
import type { Cell, Rot } from "./types.js";

export type KickResult = {
  x: number;
  y: number;
  /** 킥 보고값 [dx, −dy] (표준 표기, +y 위). 제자리 성공이면 null — §5 TST/fin 승격 불가 */
  kick: readonly [number, number] | null;
  /** 시도 목록 키 `${from}${to}` */
  id: string;
};

/**
 * 부록 §3:
 * 1. 목표 회전 상태 블록으로 제자리가 합법이면 킥 없이 성공
 * 2. 킥셋 = 테이블의 `${piece}_kicks` 우선, 없으면 공용 kicks. 키 = `${from}${to}`
 * 3. 후보 [dx, dy] 순서대로 newX = x + dx, newY = y − dy (테이블 dy 양수 = 아래)
 * 4. 전부 실패 → null
 */
export function tryRotate(
  board: readonly (readonly Cell[])[],
  table: KickTableName,
  piece: PieceType,
  from: Rot,
  to: Rot,
  x: number,
  y: number,
): KickResult | null {
  const id = `${from}${to}`;
  if (isLegal(board, pieceCells(table, piece, to, x, y))) {
    return { x, y, kick: null, id };
  }
  const sym = toSymbol(piece);
  const kickTable = KICK_TABLES[table];
  const candidates = (kickTable.piece.get(sym) ?? kickTable.common).get(id);
  if (!candidates) return null;
  for (const [dx, dy] of candidates) {
    const nx = x + dx;
    const ny = y - dy;
    if (isLegal(board, pieceCells(table, piece, to, nx, ny))) {
      return { x: nx, y: ny, kick: [dx, -dy], id };
    }
  }
  return null;
}

/** TST/fin 킥 조건 (부록 §5-3, 원문 #isTSpinKick) — 실제 킥이 발생한 경우에만 */
export function isTSpinKick(res: KickResult): boolean {
  if (res.kick === null) return false;
  const [kx, ky] = res.kick;
  return (
    ((res.id === "23" || res.id === "03") && kx === 1 && ky === -2) ||
    ((res.id === "21" || res.id === "01") && kx === -1 && ky === -2)
  );
}
