import { describe, it, expect } from "vitest";
import type { PieceType } from "@tetorial/types";
import type { PlaybackView } from "@tetorial/replay-tetrio";
import type { WorkView } from "@tetorial/sim";
import { NEXT_PREVIEW_COUNT } from "./piece-preview.js";
import { playbackHud, workHud } from "./game-hud.js";

const QUEUE: PieceType[] = ["I", "J", "L", "O", "S", "T", "Z"];

/** 재생 뷰 최소 fixture — HUD가 읽는 필드(next·hold·stats)만 조작한다. */
function playbackView(over: {
  next?: PieceType[];
  hold?: PlaybackView["hold"];
  stats?: Partial<PlaybackView["stats"]>;
}): PlaybackView {
  return {
    board: { width: 10, rows: [] },
    falling: null,
    next: over.next ?? [...QUEUE],
    hold: over.hold ?? { piece: null, locked: false },
    stats: { b2b: -1, combo: -1, pieces: 0, lines: 0, ...over.stats },
    pendingGarbage: 0,
  };
}

/** 작업 뷰 최소 fixture — 시뮬레이터·뷰어 공용 형태(WorkView). */
function workView(over: {
  next?: PieceType[];
  hold?: WorkView["hold"];
  counters?: Partial<WorkView["counters"]>;
}): WorkView {
  return {
    board: [],
    current: null,
    ghost: null,
    next: over.next ?? [...QUEUE],
    hold: over.hold ?? { piece: null, locked: false },
    counters: { b2b: -1, combo: -1, ...over.counters },
    overlays: { highlights: [] },
  };
}

describe("AW-26 공통 HUD 계산부 — 두 뷰가 동일 HudModel로 매핑", () => {
  it("AW-26 hold 없음 → null, 있음 → piece + locked 그대로", () => {
    expect(playbackHud(playbackView({ hold: { piece: null, locked: false } })).hold).toBeNull();
    expect(workHud(workView({ hold: { piece: null, locked: true } })).hold).toBeNull();
    expect(playbackHud(playbackView({ hold: { piece: "T", locked: true } })).hold).toEqual({
      piece: "T",
      locked: true,
    });
    expect(workHud(workView({ hold: { piece: "S", locked: false } })).hold).toEqual({
      piece: "S",
      locked: false,
    });
  });

  it("AW-26 next는 기존 표시 상한(5)으로 자르고 [0]이 가장 먼저 나오는 미노", () => {
    const p = playbackHud(playbackView({ next: [...QUEUE] }));
    const w = workHud(workView({ next: [...QUEUE] }));
    expect(p.next).toEqual(["I", "J", "L", "O", "S"]);
    expect(w.next).toEqual(p.next);
    expect(p.next.length).toBe(NEXT_PREVIEW_COUNT);
  });

  it("AW-26 next가 상한보다 짧으면 있는 만큼만(패딩 없음)", () => {
    expect(playbackHud(playbackView({ next: ["Z", "I"] })).next).toEqual(["Z", "I"]);
    expect(workHud(workView({ next: [] })).next).toEqual([]);
  });

  it("AW-26 같은 상태의 재생 뷰·작업 뷰는 같은 HudModel이 된다", () => {
    const p = playbackHud(
      playbackView({
        next: [...QUEUE],
        hold: { piece: "L", locked: true },
        stats: { b2b: 3, combo: 1 },
      }),
    );
    const w = workHud(
      workView({
        next: [...QUEUE],
        hold: { piece: "L", locked: true },
        counters: { b2b: 3, combo: 1 },
      }),
    );
    expect(w).toEqual(p);
  });
});

describe("AW-28 카운터 표시 규칙 — 원값 규약(-1=없음, D-10)", () => {
  it("AW-28 -1(없음)·0은 비표시, 1부터 표시 경계", () => {
    expect(workHud(workView({ counters: { b2b: -1, combo: -1 } })).counters).toEqual([]);
    expect(workHud(workView({ counters: { b2b: 0, combo: 0 } })).counters).toEqual([]);
    expect(workHud(workView({ counters: { b2b: 1, combo: 1 } })).counters).toEqual([
      { label: "B2B", value: 1 },
      { label: "Combo", value: 1 },
    ]);
  });

  it("AW-28 표시 숫자는 원값 그대로 — 가공(±1) 금지", () => {
    expect(workHud(workView({ counters: { b2b: 7, combo: 4 } })).counters).toEqual([
      { label: "B2B", value: 7 },
      { label: "Combo", value: 4 },
    ]);
  });

  it("AW-28 b2b·combo는 독립 판정 — 한쪽만 표시될 수 있다", () => {
    expect(workHud(workView({ counters: { b2b: 2, combo: -1 } })).counters).toEqual([
      { label: "B2B", value: 2 },
    ]);
    expect(workHud(workView({ counters: { b2b: 0, combo: 5 } })).counters).toEqual([
      { label: "Combo", value: 5 },
    ]);
  });

  it("AW-28 재생 stats도 같은 규칙을 탄다", () => {
    expect(playbackHud(playbackView({ stats: { b2b: -1, combo: 0 } })).counters).toEqual([]);
    expect(playbackHud(playbackView({ stats: { b2b: 1, combo: -1 } })).counters).toEqual([
      { label: "B2B", value: 1 },
    ]);
  });
});

describe("AW-29 재생 HUD 데이터 — PlaybackView(stats 원값) → HudModel", () => {
  it("AW-29 현재 프레임의 hold/next/b2b/combo가 그대로 매핑된다", () => {
    const hud = playbackHud(
      playbackView({
        next: ["S", "Z", "T", "I", "O", "J"],
        hold: { piece: "I", locked: false },
        stats: { b2b: 4, combo: 2, pieces: 120, lines: 40 },
      }),
    );
    expect(hud).toEqual({
      hold: { piece: "I", locked: false },
      next: ["S", "Z", "T", "I", "O"],
      counters: [
        { label: "B2B", value: 4 },
        { label: "Combo", value: 2 },
      ],
    });
  });

  it("AW-29 stats의 pieces·lines는 HUD 표시 대상이 아니다", () => {
    const hud = playbackHud(playbackView({ stats: { pieces: 500, lines: 200 } }));
    expect(hud.counters).toEqual([]);
  });
});
