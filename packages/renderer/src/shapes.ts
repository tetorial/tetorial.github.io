// 넥스트/홀드 미리보기용 미노 형상 표 (명세 §4-2).
//
// ⚠️ 표시 전용 자체 표다 — 물리 진실(엔진 부록 데이터)이 아니다.
// 실제 조작 미노의 물리 형상은 render의 falling.cells로 전달받으므로 렌더러는 물리를 알 필요가 없다.
// 여기 좌표는 4열×2행 정규화 배치(col 0..3, row 0=위·1=아래)이며 가이드라인 스폰 모양에 가깝게 눈에 익도록만 배치했다.
import type { PieceType } from "@tetorial/types";

/** 미노별 표시 셀 목록: [col, row] (col 0..3, row 0=위). */
export const PREVIEW_SHAPES: Record<PieceType, ReadonlyArray<readonly [number, number]>> = {
  I: [
    [0, 0],
    [1, 0],
    [2, 0],
    [3, 0],
  ],
  J: [
    [0, 0],
    [0, 1],
    [1, 1],
    [2, 1],
  ],
  L: [
    [2, 0],
    [0, 1],
    [1, 1],
    [2, 1],
  ],
  O: [
    [1, 0],
    [2, 0],
    [1, 1],
    [2, 1],
  ],
  S: [
    [1, 0],
    [2, 0],
    [0, 1],
    [1, 1],
  ],
  T: [
    [1, 0],
    [0, 1],
    [1, 1],
    [2, 1],
  ],
  Z: [
    [0, 0],
    [1, 0],
    [1, 1],
    [2, 1],
  ],
};

/** 미리보기 그리드 크기 (열·행). */
export const PREVIEW_COLS = 4;
export const PREVIEW_ROWS = 2;
