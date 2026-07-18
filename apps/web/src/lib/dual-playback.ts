// 1vs1 양보드 재생의 순수 조립 로직 (M6-B — AW-37·38·39·40).
//
// 규범(명세 §3): 구동원(시계)은 하나다. 두 플레이어의 컨트롤러를 하나의 합성 컨트롤러로 묶어
// 단일 시계(PlaybackClock)가 구동한다 — 시계 2개 병행이 만드는 프레임 드리프트를 구조적으로
// 배제한다. 여기는 UI·시간 무관 순수 로직만 담는다(프레임워크 비종속, 유닛으로 고정).
import type { PlaybackController } from "@tetorial/replay-tetrio";
import type { CaptureResult } from "@tetorial/adapter-tetrio";

/** 라운드의 보드 재생 대상(round·player). 1vs1은 여러 개, 솔로는 1개(AW-37). */
export interface BoardTarget {
  round: number;
  player: number;
}

/** 이 라운드가 양보드(1vs1)인지 — 플레이어 2명 이상이면 양보드 재생(명세 §3). */
export function isDualRound(playerCount: number): boolean {
  return playerCount >= 2;
}

/**
 * 라운드의 재생 대상 목록(AW-37). 1vs1(플레이어 ≥ 2)은 모든 플레이어를, 솔로는 그 1명을
 * 실제 플레이어 인덱스 순으로 반환한다. 빈 라운드는 방어적으로 player 0 한 벌(현행 전제 유지).
 */
export function roundTargets(round: number, playerCount: number): BoardTarget[] {
  const n = Math.max(1, playerCount);
  return Array.from({ length: n }, (_, player) => ({ round, player }));
}

/**
 * 공유 논리 프레임에서 총프레임 `boardTotalFrames`인 보드가 표시할 프레임(AW-38).
 * - 범위 안(shared ≤ total): shared 그대로 — 두 보드의 컨트롤러 frame이 언제나 동일하다.
 * - 범위 밖(shared > total): 자기 마지막 프레임(total)에서 멈춘 채 유지한다(총프레임 상이 규범).
 * 음수는 0으로 클램프한다(범위 밖 seek가 오류를 내지 않는다).
 */
export function boardFrameAt(sharedFrame: number, boardTotalFrames: number): number {
  return Math.min(Math.max(0, sharedFrame), boardTotalFrames);
}

/**
 * 스왑 반영 화면 배치 순서(AW-39). 보드 배열은 항상 실제 플레이어 인덱스 순이고, 스왑은
 * **화면 배치만** 바꾼다 — 반환값은 표시 순서대로의 보드 배열 인덱스다(플레이어 인덱스 불변).
 * 보드 2개일 때만 스왑이 의미를 가진다.
 */
export function displayOrder(boardCount: number, swapped: boolean): number[] {
  const order = Array.from({ length: boardCount }, (_, i) => i);
  if (swapped && boardCount === 2) return [order[1]!, order[0]!];
  return order;
}

/**
 * 현재 왼쪽(분기 진입 대상)에 놓인 보드의 배열 인덱스(AW-39). 스왑을 반영한다.
 * 이 인덱스가 가리키는 보드의 `player`가 분기 origin.player로 쓰이는 실제 인덱스다(AW-40).
 */
export function leftBoardIndex(boardCount: number, swapped: boolean): number {
  return displayOrder(boardCount, swapped)[0] ?? 0;
}

/**
 * 합성 컨트롤러(AW-38) — N개 자식 컨트롤러를 한 시계로 구동하기 위한 어댑터.
 * step·seek를 모든 자식에 함께 적용해 정지 상태 프레임 동기를 구조적으로 보장한다.
 * - frame:       자식들의 max(범위 밖으로 멈춘 짧은 쪽을 넘어 진행하는 긴 쪽 기준).
 * - totalFrames: 자식들의 max(슬라이더 범위 — 명세 §3).
 * - ended:       모든 자식이 끝났을 때(가장 긴 쪽이 끝나야 재생이 멈춘다).
 * `view`·`captureBranch`는 인터페이스 충족용으로 첫 자식에 위임한다 — 보드별 view/분기는
 * 세션이 자식 컨트롤러를 직접 골라 처리한다(playback-session.ts).
 */
export function createCompositeController(
  children: readonly PlaybackController[],
): PlaybackController {
  const first = children[0];
  if (first === undefined) throw new Error("createCompositeController: 컨트롤러가 최소 1개 필요");
  return {
    get frame() {
      return Math.max(...children.map((c) => c.frame));
    },
    get totalFrames() {
      return Math.max(...children.map((c) => c.totalFrames));
    },
    get ended() {
      return children.every((c) => c.ended);
    },
    step(frames = 1) {
      for (const c of children) c.step(frames);
    },
    seek(frame) {
      for (const c of children) c.seek(frame);
    },
    get view() {
      return first.view;
    },
    on(event, cb) {
      const offs = children.map((c) => c.on(event, cb));
      return () => {
        for (const off of offs) off();
      };
    },
    captureBranch(): CaptureResult {
      return first.captureBranch();
    },
  };
}
