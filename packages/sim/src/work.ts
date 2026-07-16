// 작업 상태(WorkView)와 그 스냅샷(체크포인트) 캡처·복원.
// WorkView = 엔진 관측(보드·falling·ghost·next·hold·counters) + 오버레이(명세 §3 work).
import { SimEngine } from "@tetorial/engine";
import type { Cell, CellPos, Rot } from "@tetorial/engine";
import type { PageState, PieceType, Snapshot } from "@tetorial/types";
import { OverlayBuffer } from "./overlays.js";

export type FallingPieceView = {
  type: PieceType;
  x: number;
  y: number;
  rot: Rot;
  cells: CellPos[];
};

/** 작업 상태 관측 뷰 (불변 스냅샷) — AuthoringSession.work / ViewerSession.view 공용 */
export interface WorkView {
  board: readonly (readonly Cell[])[];
  current: FallingPieceView | null;
  ghost: readonly CellPos[] | null;
  next: readonly PieceType[];
  hold: { piece: PieceType | null; locked: boolean };
  counters: { b2b: number; combo: number };
  overlays: { highlights: readonly string[] };
}

/** 엔진 + 오버레이 → 관측 뷰 (매 접근 시 새 불변 스냅샷) */
export function buildWorkView(engine: SimEngine, overlay: OverlayBuffer): WorkView {
  return {
    board: engine.boardView,
    current: engine.currentPiece,
    ghost: engine.ghostCells(),
    next: engine.nextView,
    hold: engine.holdView,
    counters: engine.capturePageState().counters,
    overlays: { highlights: overlay.serialize() },
  };
}

/**
 * 작업 상태를 PageState(+overlays)로 캡처 — 페이지 추가·언두 항목·드래프트의 단위.
 * 조작 중 미노의 위치는 포함되지 않는다(체크포인트 규약 — engine 명세 §6).
 */
export function captureWork(engine: SimEngine, overlay: OverlayBuffer): PageState {
  const base = engine.capturePageState();
  const highlights = overlay.serialize();
  return highlights.length > 0 ? { ...base, overlays: { highlights } } : base;
}

/** PageState(작업 스냅샷) → 새 엔진 + 오버레이 (snapshot이 큐 원본·룰셋 공급) */
export function restoreWork(
  snapshot: Snapshot,
  work: PageState,
): { engine: SimEngine; overlay: OverlayBuffer } {
  return {
    engine: SimEngine.fromPageState(snapshot, work),
    overlay: OverlayBuffer.fromHighlights(work.overlays?.highlights),
  };
}

/** 평문 데이터 깊은 복제 (구조적 공유 차단 — 비정규화 자립성 보장). JSON 안전 객체 전용 */
export function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
