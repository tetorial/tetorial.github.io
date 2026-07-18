// 공통 게임 HUD 계산부 (m5-a §2 — AW-26·28·29). 재생(PlaybackView)·시뮬레이터/뷰어(WorkView)의
// 뷰를 단일 HudModel로 매핑한다. 그리기는 components/GameHud.tsx — 여기는 "무엇을 표시할지"만.
// hold·next는 기존 piece-preview 계산부를 재사용한다(표시 개수 규약 불변 — NEXT_PREVIEW_COUNT).
import type { PieceType } from "@tetorial/types";
import type { PlaybackView } from "@tetorial/replay-tetrio";
import type { WorkView } from "@tetorial/sim";
import { holdPreview, nextPreviewSlice } from "./piece-preview.js";

export interface HudModel {
  hold: { piece: PieceType; locked: boolean } | null;
  next: PieceType[]; // [0] = 가장 먼저 나오는 미노
  counters: { label: "B2B" | "Combo"; value: number }[]; // 표시할 것만 담는다
}

// 카운터는 tetr.io 원값 규약(-1 = 없음, 0부터 유효 — D-10). 정규화 계층을 만들지 않는다:
// value >= 1일 때만 포함하고 숫자는 원값 그대로(±1 가공 금지). b2b·combo는 독립 판정.
function hudCounters(b2b: number, combo: number): HudModel["counters"] {
  const counters: HudModel["counters"] = [];
  if (b2b >= 1) counters.push({ label: "B2B", value: b2b });
  if (combo >= 1) counters.push({ label: "Combo", value: combo });
  return counters;
}

/** 재생 뷰 → HUD 뷰모델 (stats도 원값 규약 공유 — D-10). */
export function playbackHud(view: PlaybackView): HudModel {
  return {
    hold: holdPreview(view.hold),
    next: nextPreviewSlice(view.next),
    counters: hudCounters(view.stats.b2b, view.stats.combo),
  };
}

/** 작업 뷰 → HUD 뷰모델 — 시뮬레이터·노트 뷰어 공용(뷰어의 view도 WorkView다). */
export function workHud(view: WorkView): HudModel {
  return {
    hold: holdPreview(view.hold),
    next: nextPreviewSlice(view.next),
    counters: hudCounters(view.counters.b2b, view.counters.combo),
  };
}
