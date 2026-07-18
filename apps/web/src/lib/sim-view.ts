// 재생 ↔ 시뮬레이터 인플레이스 전환의 표시 계약 (M6-A AW-34·35).
// ReplayIsland가 이 순수 판정으로 같은 화면 자리에서 모드를 교체한다 — 오버레이 모달이 아니라
// 같은 문서 흐름 안의 모드 전환이다(명세 §3). 여기는 UI 무관 판정만 담는다(프레임워크 비종속).
import type { SimEntry } from "../components/SimulatorPanel.tsx";

export type ReplayViewMode = "playback" | "edit";

/** 시뮬레이터 진입 상태(simEntry)로 현재 화면 모드를 판정한다. */
export function replayViewMode(simEntry: SimEntry | null): ReplayViewMode {
  return simEntry ? "edit" : "playback";
}

/**
 * 재생 전용 크롬(재생 컨트롤·라운드/플레이어 선택·리플레이 업로드·분기 바·노트 사이드바)을
 * 표시할지 여부(AW-35). 편집 중에는 숨겨 재생 상태가 갈라지는 것을 막는다(명세 §3) —
 * 편집 영역이 재생 영역 자리를 그대로 차지한다.
 */
export function showsPlaybackChrome(mode: ReplayViewMode): boolean {
  return mode === "playback";
}
