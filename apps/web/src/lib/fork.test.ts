import { describe, it, expect } from "vitest";
import { planFork, FORK_QUEUE_EXHAUSTED_NOTICE } from "./fork.ts";
import { NOTES_LIMITS } from "@tetorial/types";
import type { Note, PageState } from "@tetorial/types";

// AW-41 페이지 fork 진입 계획(planFork)의 순수 로직 — 진입 매핑·한도·오류 분기.
// 실브라우저 진입·인라인 안내는 e2e/m6c-fork.spec.ts가 고정한다.

const baseState: PageState = {
  board: { width: 10, rows: ["GGGGGGGGG_"] },
  current: "T",
  hold: "I",
  holdLocked: false,
  queueUsed: 2,
  counters: { b2b: 3, combo: 1 },
};

/** 유효 페이지(current 존재) 1개를 가진 타인 노트. queue는 queueUsed(2)만큼 소비된 상태. */
function noteWithPage(state: Partial<PageState> = {}): Note {
  return {
    id: "OtHeR001",
    origin: { type: "replay", round: 1, player: 0, frame: 420 },
    snapshot: {
      ruleset: { preset: "srs" },
      board: { width: 10, rows: [] },
      current: "L",
      hold: null,
      holdLocked: false,
      queue: "IJLOSTZ",
      counters: { b2b: -1, combo: -1 },
    },
    pages: [{ id: "PgFork01", state: { ...baseState, ...state }, comment: "국면" }],
    createdAt: "2026-07-19T00:00:00.000Z",
    updatedAt: "2026-07-19T00:00:00.000Z",
  };
}

/** notes 배열 길이만 참조되므로(countReplayNotes) 내용은 형태 충족용 빈 객체. */
function filesWithNoteCount(n: number): { notes: unknown[] }[] {
  return [{ notes: Array.from({ length: n }, () => ({})) }];
}

describe("AW-41 페이지 fork 진입 계획 (planFork)", () => {
  it("AW-41 진입 매핑 — 유효 페이지는 파생 스냅샷·origin의 복사로 fork 진입한다", () => {
    const note = noteWithPage();
    const outcome = planFork(note, "PgFork01", filesWithNoteCount(1));

    expect(outcome.kind).toBe("enter");
    if (outcome.kind !== "enter") return;
    expect(outcome.entry.kind).toBe("fork");

    // snapshot: 보드·current·hold·counters는 페이지 상태에서, queue는 원본 큐의 잔여분(slice).
    expect(outcome.entry.snapshot.current).toBe("T");
    expect(outcome.entry.snapshot.board.rows).toEqual(["GGGGGGGGG_"]);
    expect(outcome.entry.snapshot.queue).toBe("LOSTZ"); // "IJLOSTZ".slice(2)
    expect(outcome.entry.snapshot.counters).toEqual({ b2b: 3, combo: 1 });

    // origin: 원본 노트 origin의 복사 — 리플레이 좌표 그대로(D-8, 참조 아님).
    expect(outcome.entry.origin).toEqual({ type: "replay", round: 1, player: 0, frame: 420 });
  });

  it("AW-41 진입 매핑 — 파생 결과는 원본 노트를 참조하지 않는 복사다(원본 무수정, D-8)", () => {
    const note = noteWithPage();
    const outcome = planFork(note, "PgFork01", filesWithNoteCount(0));
    if (outcome.kind !== "enter") throw new Error("진입 실패");

    // 복사이므로 파생 스냅샷을 변형해도 원본 노트는 무영향이어야 한다.
    expect(outcome.entry.snapshot.board).not.toBe(note.pages[0]!.state.board);
    expect(outcome.entry.origin).not.toBe(note.origin);
    outcome.entry.snapshot.board.rows.push("XXXXXXXXXX");
    outcome.entry.origin.frame = 0;
    expect(note.pages[0]!.state.board.rows).toEqual(["GGGGGGGGG_"]);
    expect(note.origin.frame).toBe(420);
  });

  it("AW-41 오류 분기 — current가 null인 페이지(queue-exhausted)는 인라인 안내로 차단한다", () => {
    const note = noteWithPage({ current: null });
    const outcome = planFork(note, "PgFork01", filesWithNoteCount(1));

    expect(outcome).toEqual({ kind: "blocked", reason: FORK_QUEUE_EXHAUSTED_NOTICE });
  });

  it("AW-41 한도 — 노트 합산 한도 도달 시 파생 이전에 진입을 차단한다(분기와 동일 적용)", () => {
    const note = noteWithPage(); // 유효 페이지지만 한도가 우선한다
    const outcome = planFork(note, "PgFork01", filesWithNoteCount(NOTES_LIMITS.maxNotesPerReplay));

    expect(outcome.kind).toBe("blocked");
    if (outcome.kind !== "blocked") return;
    expect(outcome.reason).toContain(String(NOTES_LIMITS.maxNotesPerReplay));
    expect(outcome.reason).not.toBe(FORK_QUEUE_EXHAUSTED_NOTICE); // 한도 사유가 우선
  });

  it("AW-41 한도 — 한도 도달 + queue-exhausted가 겹쳐도 한도 사유가 우선한다", () => {
    const note = noteWithPage({ current: null });
    const outcome = planFork(note, "PgFork01", filesWithNoteCount(NOTES_LIMITS.maxNotesPerReplay));

    expect(outcome.kind).toBe("blocked");
    if (outcome.kind !== "blocked") return;
    // 한도가 먼저 걸리므로 queue-exhausted 문구가 아니라 한도 문구가 나온다.
    expect(outcome.reason).not.toBe(FORK_QUEUE_EXHAUSTED_NOTICE);
  });
});
