// 테스트 전용 헬퍼 — 런타임 소스가 아니다(eslint 테스트 예외 대상: src/testing/).
import type { Note, Origin, Snapshot } from "@tetorial/types";

/** 기본 진입 스냅샷 (필드 오버라이드 가능) */
export function makeSnapshot(over: Partial<Snapshot> = {}): Snapshot {
  return {
    ruleset: { preset: "srs+" },
    board: { width: 10, rows: [] },
    current: "T",
    hold: null,
    holdLocked: false,
    queue: "IJLOSZTIJLOSZT", // 14개
    counters: { b2b: -1, combo: -1 },
    ...over,
  };
}

export function makeReplayOrigin(over: Partial<Extract<Origin, { type: "replay" }>> = {}): Origin {
  return { type: "replay", round: 0, player: 0, frame: 0, ...over };
}

/** 유효 clientId ([A-Za-z0-9_-]{12}) */
export const TEST_CLIENT_ID = "clientABC123";

/** notes §4 재시뮬레이션 규범을 문자 그대로 조립 — S-2 독립 오라클 */
export function respecSnapshotFromPage(note: Note, pageId: string): Snapshot {
  const page = note.pages.find((p) => p.id === pageId);
  if (!page) throw new Error(`page ${pageId} 없음`);
  return {
    ruleset: note.snapshot.ruleset,
    board: page.state.board,
    current: page.state.current ?? "I", // 규범: current가 null이면 재개 불가(호출 측이 배제)
    hold: page.state.hold,
    holdLocked: page.state.holdLocked,
    queue: note.snapshot.queue.slice(page.state.queueUsed),
    counters: page.state.counters,
  };
}

/** 시드 LCG (Math.random 대체) */
export function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}
