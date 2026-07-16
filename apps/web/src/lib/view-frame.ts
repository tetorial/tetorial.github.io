// 재생/시뮬레이터 뷰 → renderer의 RenderFrame 변환 (apps-web 조립 계층).
// renderer는 BoardRows를 받지만 sim WorkView.board는 Cell[][]이므로 여기서 변환한다.
import type { Cell } from "@tetorial/engine";
import type { WorkView } from "@tetorial/sim";
import type { BoardRows } from "@tetorial/types";
import type { RenderFrame } from "@tetorial/renderer";
import type { PlaybackView } from "@tetorial/replay-tetrio";

/** Cell[][] ([y][x], y=0 최하단, 전체 높이 40) → BoardRows(rows[0]=최하단). */
export function workBoardToRows(board: readonly (readonly Cell[])[]): BoardRows {
  return { width: 10, rows: board.map((row) => row.join("")) };
}

/** 재생 뷰 → RenderFrame (falling은 실좌표, ghost 없음). */
export function playbackFrame(view: PlaybackView): RenderFrame {
  return {
    board: view.board,
    falling: view.falling,
  };
}

/** 시뮬레이터 작업 뷰 → RenderFrame (falling·ghost·오버레이 포함). */
export function workFrame(view: WorkView): RenderFrame {
  return {
    board: workBoardToRows(view.board),
    falling: view.current ? { type: view.current.type, cells: [...view.current.cells] } : null,
    ghost: view.ghost ? [...view.ghost] : null,
    overlays: { highlights: [...view.overlays.highlights] },
  };
}
