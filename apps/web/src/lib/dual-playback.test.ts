import { describe, it, expect } from "vitest";
import type { PlaybackController, PlaybackView } from "@tetorial/replay-tetrio";
import type { CaptureResult } from "@tetorial/adapter-tetrio";
import {
  isDualRound,
  roundTargets,
  boardFrameAt,
  displayOrder,
  leftBoardIndex,
  createCompositeController,
} from "./dual-playback.js";

const EMPTY_VIEW: PlaybackView = {
  board: { width: 10, rows: [] },
  falling: null,
  next: [],
  hold: { piece: null, locked: false },
  stats: { b2b: -1, combo: -1, pieces: 0, lines: 0 },
  pendingGarbage: 0,
};

/**
 * 결정론 컨트롤러의 프레임 거동만 흉내 내는 가짜(step은 총프레임에서 멈추고, seek는 [0,total]로
 * 클램프한다) — 실제 TetrioPlayback과 동일한 경계 규칙이다(playback.ts seek/step).
 */
function fakeController(
  total: number,
  branch: CaptureResult = { ok: false, reason: "topped-out" },
): PlaybackController {
  let frame = 0;
  return {
    get frame() {
      return frame;
    },
    get totalFrames() {
      return total;
    },
    get ended() {
      return frame >= total;
    },
    step(n = 1) {
      if (n <= 0) return;
      frame = Math.min(total, frame + n);
    },
    seek(f) {
      frame = Math.max(0, Math.min(total, f));
    },
    get view() {
      return EMPTY_VIEW;
    },
    on() {
      return () => {};
    },
    captureBranch() {
      return branch;
    },
  };
}

// AW-37 양보드 재생: 라운드의 재생 대상 선택 — 1vs1은 두 플레이어, 솔로는 1명.
describe("AW-37 양보드 대상 선택", () => {
  it("AW-37 1vs1(플레이어 2명)은 두 보드 대상, 솔로(1명)는 한 보드", () => {
    expect(isDualRound(2)).toBe(true);
    expect(isDualRound(1)).toBe(false);
    expect(roundTargets(0, 2)).toEqual([
      { round: 0, player: 0 },
      { round: 0, player: 1 },
    ]);
    expect(roundTargets(1, 1)).toEqual([{ round: 1, player: 0 }]);
  });

  it("AW-37 빈 라운드도 최소 한 보드(player 0)로 방어한다", () => {
    expect(roundTargets(2, 0)).toEqual([{ round: 2, player: 0 }]);
  });
});

// AW-38 동기 컨트롤: 한 시계가 합성 컨트롤러를 구동 — 정지 상태 프레임 동기 + 총프레임 상이 처리.
describe("AW-38 동기 컨트롤(합성 컨트롤러)", () => {
  it("AW-38 step/seek가 모든 보드에 함께 적용되고 각 보드 frame = min(공유 frame, 자기 총프레임)", () => {
    const shortC = fakeController(300);
    const longC = fakeController(1000);
    const composite = createCompositeController([shortC, longC]);

    // 슬라이더 범위는 두 보드의 max(totalFrames)
    expect(composite.totalFrames).toBe(1000);

    // 범위 안(≤ 짧은 쪽 총프레임): 두 컨트롤러 frame이 언제나 동일
    composite.step(200);
    expect(shortC.frame).toBe(200);
    expect(longC.frame).toBe(200);
    expect(composite.frame).toBe(200);

    // 프레임 동기 불변식: 각 보드는 공유 frame을 자기 총프레임으로 클램프한 값을 가진다
    for (const f of [50, 300, 700, 1000]) {
      composite.seek(f);
      expect(shortC.frame).toBe(boardFrameAt(composite.frame, 300));
      expect(longC.frame).toBe(boardFrameAt(composite.frame, 1000));
    }
  });

  it("AW-38 짧은 쪽은 자기 마지막 프레임에서 멈추고, 긴 쪽만 계속 진행한다", () => {
    const shortC = fakeController(300);
    const longC = fakeController(1000);
    const composite = createCompositeController([shortC, longC]);

    composite.seek(300);
    composite.step(400); // 공유 frame 700로 — 짧은 쪽은 이미 끝
    expect(shortC.frame).toBe(300); // 마지막 프레임 유지
    expect(longC.frame).toBe(700);
    expect(composite.frame).toBe(700); // 공유 frame = 긴 쪽

    // ended는 모든 보드가 끝나야 true(가장 긴 쪽 기준)
    expect(composite.ended).toBe(false);
    composite.seek(1000);
    expect(shortC.ended).toBe(true);
    expect(longC.ended).toBe(true);
    expect(composite.ended).toBe(true);
  });

  it("AW-38 범위 밖 seek(음수·max 초과)는 오류 없이 클램프된다", () => {
    const shortC = fakeController(300);
    const longC = fakeController(1000);
    const composite = createCompositeController([shortC, longC]);

    expect(() => composite.seek(-50)).not.toThrow();
    expect(composite.frame).toBe(0);
    expect(() => composite.seek(99999)).not.toThrow();
    expect(composite.frame).toBe(1000); // max(totalFrames)로 클램프
    expect(shortC.frame).toBe(300);
  });

  it("AW-38 view·captureBranch는 첫 보드에 위임한다(보드별 처리는 세션이 담당)", () => {
    const first = fakeController(300, { ok: false, reason: "unsupported-board" });
    const second = fakeController(1000, { ok: false, reason: "topped-out" });
    const composite = createCompositeController([first, second]);
    expect(composite.view).toBe(first.view);
    const branch = composite.captureBranch();
    expect(branch.ok).toBe(false);
    if (!branch.ok) expect(branch.reason).toBe("unsupported-board");
  });

  it("AW-38 솔로(보드 1개)도 동일 인터페이스로 동작한다", () => {
    const only = fakeController(500);
    const composite = createCompositeController([only]);
    composite.step(120);
    expect(composite.frame).toBe(120);
    expect(composite.totalFrames).toBe(500);
    composite.seek(500);
    expect(composite.ended).toBe(true);
  });
});

// AW-39 보드 스왑: 스왑은 화면 배치 순서만 바꾸고, 왼쪽(분기 대상) 보드가 바뀐다.
describe("AW-39 보드 스왑(화면 배치)", () => {
  it("AW-39 스왑이 표시 순서를 뒤집는다(보드 2개)", () => {
    expect(displayOrder(2, false)).toEqual([0, 1]);
    expect(displayOrder(2, true)).toEqual([1, 0]);
  });

  it("AW-39 왼쪽 보드 인덱스가 스왑을 반영한다 — 분기 진입 대상", () => {
    expect(leftBoardIndex(2, false)).toBe(0);
    expect(leftBoardIndex(2, true)).toBe(1);
  });

  it("AW-39 보드가 1개면 스왑은 무의미(순서 불변)", () => {
    expect(displayOrder(1, true)).toEqual([0]);
    expect(leftBoardIndex(1, true)).toBe(0);
  });
});

// AW-40 노트 호환: 스왑은 각 보드의 실제 플레이어 인덱스를 바꾸지 않는다 — origin.player 기준 불변.
describe("AW-40 실제 플레이어 인덱스 불변(스왑 무관)", () => {
  it("AW-40 스왑해도 왼쪽 보드가 가리키는 실제 플레이어만 바뀔 뿐, 보드↔플레이어 귀속은 불변", () => {
    // boards는 실제 플레이어 인덱스 순 [player 0, player 1]
    const boards = [{ player: 0 }, { player: 1 }];

    // 스왑 전: 왼쪽 = player 0
    expect(boards[leftBoardIndex(2, false)]!.player).toBe(0);
    // 스왑 후: 왼쪽 = player 1 (원하는 플레이어를 왼쪽에 두고 분기)
    expect(boards[leftBoardIndex(2, true)]!.player).toBe(1);

    // 표시 순서가 바뀌어도 각 슬롯이 나타내는 실제 플레이어 집합은 그대로다
    expect(displayOrder(2, true).map((i) => boards[i]!.player)).toEqual([1, 0]);
    expect(displayOrder(2, false).map((i) => boards[i]!.player)).toEqual([0, 1]);
  });
});
