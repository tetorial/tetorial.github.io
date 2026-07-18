// 재생 세션 — 결정론 컨트롤러(createPlayback) + 실시간 시계(PlaybackClock)를 묶은 얇은 셸.
// 타이머(now/schedule/cancel)는 주입식이다 — 브라우저는 performance.now·rAF, 테스트는 수동 타이머.
//
// M6-B: 세션은 N개 보드(1vs1은 2개, 솔로는 1개)를 담는다. 구동원(시계)은 하나로, 합성 컨트롤러
// (dual-playback.ts)를 통해 모든 자식 컨트롤러에 step·seek를 함께 적용한다 — 정지 상태에서 두
// 보드의 frame이 언제나 동일하도록(명세 §3 프레임 동기 규범, AW-38).
import { createPlayback, PlaybackClock } from "@tetorial/replay-tetrio";
import type {
  PlaybackController,
  PlaybackView,
  PlaybackClockOptions,
} from "@tetorial/replay-tetrio";
import type { CaptureResult } from "@tetorial/adapter-tetrio";
import { createCompositeController, type BoardTarget } from "./dual-playback.js";

export type PlaybackTimers = Pick<PlaybackClockOptions, "now" | "schedule" | "cancel">;

/** 한 보드(플레이어 1명)의 재생 상태. `player`는 실제 플레이어 인덱스 — 스왑과 무관하게 불변(AW-40). */
export interface PlaybackBoard {
  /** 실제 플레이어 인덱스(스왑 불변 — 마커·origin·사이드바 해석의 기준). */
  readonly player: number;
  readonly controller: PlaybackController;
  /** 이 보드의 렌더 뷰(매 프레임 유효). */
  readonly view: PlaybackView;
  /** 이 보드 자신의 프레임(공유 프레임을 자기 총프레임으로 클램프한 값). */
  readonly frame: number;
  readonly totalFrames: number;
  readonly ended: boolean;
}

export interface PlaybackSession {
  /** 실제 플레이어 인덱스 순 보드 배열(스왑은 화면 배치 단계에서만 적용). */
  readonly boards: readonly PlaybackBoard[];
  /** 공유 논리 프레임(가장 긴 보드 기준 — 슬라이더 위치). */
  readonly frame: number;
  /** 슬라이더 범위 = 두 보드의 max(totalFrames) (명세 §3). */
  readonly totalFrames: number;
  readonly ended: boolean;
  readonly speed: number;
  readonly playing: boolean;
  play(): void;
  pause(): void;
  seek(frame: number): void;
  step(frames?: number): void;
  setSpeed(speed: number): void;
  /**
   * 분기(시뮬레이터 진입) 캡처 — 실제 플레이어 인덱스로 지정한다(항상 프레임 경계, §5).
   * 왼쪽 보드 진입만 허용하는 규칙(AW-39)은 호출자(ReplayIsland)가 왼쪽 보드의 player를 넘겨 강제한다.
   */
  captureBranchFor(player: number): CaptureResult;
  subscribe(cb: () => void): () => void;
  dispose(): void;
}

/**
 * 라운드의 재생 대상들(1vs1은 2개, 솔로는 1개)을 하나의 시계로 구동하는 세션을 만든다.
 * 각 `target.round`는 doc 내부 인덱스다(원본 번호 변환은 open-replay.originalRound가 담당).
 * 대상은 실제 플레이어 인덱스 순으로 주며, 반환 `boards`도 그 순서를 유지한다.
 */
export function createPlaybackSession(
  doc: Parameters<typeof createPlayback>[0],
  targets: readonly BoardTarget[],
  timers: PlaybackTimers,
): PlaybackSession {
  if (targets.length === 0) throw new Error("createPlaybackSession: 재생 대상이 최소 1개 필요");

  const controllers = targets.map((t) => createPlayback(doc, t));
  const composite = createCompositeController(controllers);
  const clock = new PlaybackClock(composite, {
    now: timers.now,
    schedule: timers.schedule,
    cancel: timers.cancel,
  });

  const boards: PlaybackBoard[] = targets.map((t, i) => {
    const controller = controllers[i]!;
    return {
      player: t.player,
      controller,
      get view() {
        return controller.view;
      },
      get frame() {
        return controller.frame;
      },
      get totalFrames() {
        return controller.totalFrames;
      },
      get ended() {
        return controller.ended;
      },
    };
  });

  const listeners = new Set<() => void>();
  const notify = (): void => {
    for (const cb of listeners) cb();
  };

  return {
    boards,
    get frame() {
      return composite.frame;
    },
    get totalFrames() {
      return composite.totalFrames;
    },
    get ended() {
      return composite.ended;
    },
    get speed() {
      return clock.speed;
    },
    get playing() {
      return clock.playing;
    },
    play() {
      clock.play();
      notify();
    },
    pause() {
      clock.pause();
      notify();
    },
    seek(frame) {
      composite.seek(frame);
      notify();
    },
    step(frames) {
      composite.step(frames);
      notify();
    },
    setSpeed(speed) {
      clock.setSpeed(speed);
      notify();
    },
    captureBranchFor(player) {
      const board = boards.find((b) => b.player === player) ?? boards[0]!;
      return board.controller.captureBranch();
    },
    subscribe(cb) {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    dispose() {
      clock.pause();
      listeners.clear();
    },
  };
}
