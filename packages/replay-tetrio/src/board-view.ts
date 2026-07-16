// triangle 보드 상태 → notes BoardRows(렌더러 소비 뷰) — 명세 §5 view.board.
//
// 어댑터 §4의 셀 매핑과 동일 규약: 행 방향 동일([0]=최하단), 상단 전부-빈 행 트림,
// connections 폐기. 어댑터의 것은 export되지 않으므로 재생 뷰용으로 여기 최소 복제한다.
// (어댑터는 분기 Snapshot용, 여기는 매 프레임 라이브 뷰용 — 소비처가 다르다.)
import type { Tile } from "@haelp/teto/engine";
import { NOTES_LIMITS, type BoardRows, type PieceType } from "@tetorial/types";

/** 미노 심볼(triangle 소문자) → notes 대문자. "gb"(쓰레기)는 셀 전용이라 별도 처리. */
const PIECE_CHAR: Readonly<Record<string, PieceType>> = {
  i: "I",
  j: "J",
  l: "L",
  o: "O",
  s: "S",
  t: "T",
  z: "Z",
};

const EMPTY_ROW = "_".repeat(NOTES_LIMITS.boardWidth);

/** 미노 심볼 → 대문자 PieceType. current/hold/queue에는 7미노만 온다(triangle 실측 전제). */
export function pieceChar(mino: string): PieceType {
  const ch = PIECE_CHAR[mino];
  if (ch === undefined) {
    throw new Error(
      `replay-tetrio: 미노가 아닌 심볼 "${mino}" — @haelp/teto 실측 전제 재검증 필요`,
    );
  }
  return ch;
}

/** 셀 매핑: null → "_", gb → "G", 7미노 → 대문자, 미지 심볼 → "G" 강등 + 콘솔 경고(전방 호환). */
function cellChar(tile: Tile | undefined, warned: Set<string>): string {
  if (tile === null || tile === undefined) return "_";
  if (tile.mino === "gb") return "G";
  const ch = PIECE_CHAR[tile.mino];
  if (ch !== undefined) return ch;
  if (!warned.has(tile.mino)) {
    warned.add(tile.mino);
    console.warn(`replay-tetrio: 미지의 셀 심볼 "${tile.mino}" → "G"로 강등 (어댑터 §4 대칭)`);
  }
  return "G";
}

/** 엔진 보드 상태를 렌더러가 소비하는 BoardRows로 변환한다(상단 전부-빈 행 트림). */
export function toBoardRows(state: readonly (readonly Tile[])[]): BoardRows {
  const warned = new Set<string>();
  const rows = state.map((row) => {
    let encoded = "";
    for (let x = 0; x < NOTES_LIMITS.boardWidth; x++) encoded += cellChar(row[x], warned);
    return encoded;
  });
  while (rows.length > 0 && rows[rows.length - 1] === EMPTY_ROW) rows.pop();
  return { width: NOTES_LIMITS.boardWidth, rows };
}
