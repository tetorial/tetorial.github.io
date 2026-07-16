// 미노 형상·스폰·절대 셀 산출 — 부록 §1(좌표 규약)·§2(스폰) 전사
import type { PieceType } from "@tetorial/types";
import { BOARD_WIDTH, VISIBLE_HEIGHT } from "./board.js";
import { KICK_TABLES, tetromino } from "./data.js";
import type { KickTableName, Pair, PieceSymbol } from "./data.js";
import type { CellPos, Rot } from "./types.js";

export function toSymbol(piece: PieceType): PieceSymbol {
  return piece.toLowerCase() as PieceSymbol;
}

/** 킥테이블의 additional_offsets (SRS·SRS+는 항상 [0,0] — 부록 §1) */
export function additionalOffset(table: KickTableName, sym: PieceSymbol): Pair {
  return KICK_TABLES[table].additionalOffsets.get(sym) ?? [0, 0];
}

/**
 * 미노 절대 셀 산출 (부록 §1):
 *   baseX = pieceX − ao[0], baseY = pieceY − ao[1]
 *   cell[i] = [baseX + block[0], baseY − block[1]]  (block의 by는 아래 방향 양수)
 * 우리 엔진의 pieceY는 항상 정수 (무중력 턴제 — 원문 floor 통과 후 동일 결과)
 */
export function pieceCells(
  table: KickTableName,
  piece: PieceType,
  rot: Rot,
  x: number,
  y: number,
): CellPos[] {
  const sym = toSymbol(piece);
  const [aox, aoy] = additionalOffset(table, sym);
  const blocks = tetromino(sym).blocks[rot];
  if (!blocks) throw new Error(`형상 데이터 부재: ${sym} rot ${rot}`);
  return blocks.map(([bx, by]) => ({ x: x - aox + bx, y: y - aoy - by }));
}

/**
 * 스폰 위치·회전 (부록 §2):
 *   location = [floor(width/2 − matrix.w/2), boardHeight + 2]  (원문 +2.04의 정수화)
 *   rotation = spawn_rotation[piece] ?? 0  (SRS·SRS+는 빈 객체 → 항상 0)
 */
export function spawnState(
  table: KickTableName,
  piece: PieceType,
): { x: number; y: number; rot: Rot } {
  const sym = toSymbol(piece);
  const x = Math.floor(BOARD_WIDTH / 2 - tetromino(sym).w / 2);
  const y = VISIBLE_HEIGHT + 2;
  const rot = (KICK_TABLES[table].spawnRotation.get(sym) ?? 0) % 4;
  return { x, y, rot: rot as Rot };
}
