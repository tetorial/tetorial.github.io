// 보드 표현·직렬화·합법성 판정 — 좌표계는 명세 §4 (y: 0=최하단, rows[0]=최하단)
import type { BoardRows } from "@tetorial/types";
import type { Cell, CellPos } from "./types.js";

export const BOARD_WIDTH = 10;
export const VISIBLE_HEIGHT = 20;
export const BUFFER_HEIGHT = 20;
/** 내부 전체 높이 = 가시 20 + 상단 비가시 버퍼 20 (명세 §4) */
export const FULL_HEIGHT = VISIBLE_HEIGHT + BUFFER_HEIGHT;

const CELL_CHARS = new Set(["_", "G", "D", "I", "J", "L", "O", "S", "T", "Z"]);

function isCell(ch: string): ch is Cell {
  return CELL_CHARS.has(ch);
}

/** BoardRows(상단 트림 가능) → 전체 높이 40의 Cell[][] ([y][x]) */
export function parseBoard(board: BoardRows): Cell[][] {
  if (board.rows.length > FULL_HEIGHT) {
    throw new Error(`board.rows는 최대 ${FULL_HEIGHT}행 (받은 값: ${board.rows.length})`);
  }
  const cells: Cell[][] = [];
  for (let y = 0; y < FULL_HEIGHT; y++) {
    const row = board.rows[y];
    if (row !== undefined && row.length !== BOARD_WIDTH) {
      throw new Error(`board.rows[${y}]는 width(${BOARD_WIDTH}) 길이여야 한다: "${row}"`);
    }
    const line: Cell[] = [];
    for (let x = 0; x < BOARD_WIDTH; x++) {
      const ch = row?.[x] ?? "_";
      if (!isCell(ch)) throw new Error(`board.rows[${y}]의 셀 문자 불일치: "${ch}"`);
      line.push(ch);
    }
    cells.push(line);
  }
  return cells;
}

/** Cell[][] → BoardRows. 상단의 전부-빈 행은 트림한다 (notes 스키마 §4) */
export function serializeBoard(cells: readonly (readonly Cell[])[]): BoardRows {
  let top = -1;
  for (let y = cells.length - 1; y >= 0; y--) {
    if (cells[y]?.some((c) => c !== "_")) {
      top = y;
      break;
    }
  }
  const rows: string[] = [];
  for (let y = 0; y <= top; y++) {
    rows.push((cells[y] ?? []).join(""));
  }
  return { width: BOARD_WIDTH, rows };
}

/** 점유 판정: 보드 밖은 점유로 취급 (triangle Board.occupied와 동일 — 코너 판정용) */
export function isOccupied(board: readonly (readonly Cell[])[], x: number, y: number): boolean {
  if (x < 0 || x >= BOARD_WIDTH || y < 0 || y >= FULL_HEIGHT) return true;
  return board[y]?.[x] !== "_";
}

/** 셀 집합이 전부 보드 안 + 빈 칸인가 (triangle legal과 동일) */
export function isLegal(board: readonly (readonly Cell[])[], cells: readonly CellPos[]): boolean {
  return cells.every((c) => !isOccupied(board, c.x, c.y));
}

/** 가득 찬 행 제거 + 위 행 하강 (락 직후 호출, 명세 §8). 제거한 행 수 반환 */
export function clearFullRows(board: Cell[][]): number {
  let cleared = 0;
  for (let y = 0; y < board.length;) {
    if (board[y]?.every((c) => c !== "_")) {
      board.splice(y, 1);
      board.push(new Array<Cell>(BOARD_WIDTH).fill("_"));
      cleared++;
    } else {
      y++;
    }
  }
  return cleared;
}
