import { describe, it, expect } from "vitest";
import { replayViewMode, showsPlaybackChrome } from "./sim-view.ts";
import type { SimEntry } from "../components/SimulatorPanel.tsx";
import type { Note } from "@tetorial/types";

// 재편집 진입(existing) 형태의 최소 SimEntry — replayViewMode는 진입 여부만 보므로
// 노트 내용은 판정에 영향이 없다(값은 형태 충족용).
const NOTE: Note = {
  id: "AbCdEf12",
  origin: { type: "replay", round: 0, player: 0, frame: 0 },
  snapshot: {
    ruleset: { preset: "srs" },
    board: { width: 10, rows: [] },
    current: "T",
    hold: null,
    holdLocked: false,
    queue: "IJLOSTZ",
    counters: { b2b: -1, combo: -1 },
  },
  pages: [],
  createdAt: "2026-07-18T00:00:00.000Z",
  updatedAt: "2026-07-18T00:00:00.000Z",
};
const EDIT_ENTRY: SimEntry = { kind: "existing", note: NOTE };

describe("M6-A 인플레이스 전환 표시 계약 (sim-view)", () => {
  it("AW-34 simEntry 없으면 재생 모드, 있으면 편집 모드로 판정한다", () => {
    expect(replayViewMode(null)).toBe("playback");
    expect(replayViewMode(EDIT_ENTRY)).toBe("edit");
  });

  it("AW-35 재생 전용 크롬은 재생 모드에서만 표시한다(편집 중 숨김)", () => {
    expect(showsPlaybackChrome(replayViewMode(null))).toBe(true);
    expect(showsPlaybackChrome(replayViewMode(EDIT_ENTRY))).toBe(false);
  });

  // 편집 종료 = simEntry 해제(null). 전환이 순수 판정이라 진입↔종료가 대칭이므로, 종료 시 재생
  // 모드로 복귀하고 재생 컨트롤(크롬)이 되살아난다 — 실브라우저 회귀(분기 프레임 복귀·포커스·키
  // 배선·수집 유지)는 e2e/m6a.spec.ts가 고정한다.
  it("AW-36 편집 종료(simEntry=null) 시 재생 모드로 복귀하고 재생 크롬이 되살아난다", () => {
    expect(showsPlaybackChrome(replayViewMode(EDIT_ENTRY))).toBe(false); // 편집 중 숨김
    expect(showsPlaybackChrome(replayViewMode(null))).toBe(true); // 종료 후 복원
  });
});
