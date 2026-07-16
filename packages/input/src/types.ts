// @tetorial/input 공개 타입 — 명세 docs/specs/input.md §2(설정)·§4(API)
// 명세에 없는 공개 API 추가 금지 (conventions §5) — 제안은 QUESTIONS.md로.

/** 바인딩 가능한 액션. 게임 조작 + 메타 액션(undo/redo/addPage)을 모두 포함 (명세 §2) */
export type Action =
  | "moveLeft"
  | "moveRight"
  | "softDrop"
  | "hardDrop"
  | "rotateCW"
  | "rotateCCW"
  | "rotate180"
  | "hold"
  | "undo"
  | "redo"
  | "addPage";

/** sim/UI로 전달되는 메타 액션 (엔진 조작이 아니다) */
export type MetaAction = "undo" | "redo" | "addPage";

/** 핸들링 설정 (명세 §2). 하한·상한 강제 없음, 0 허용 (D-10 제한 없는 핸들링) */
export type HandlingConfig = {
  das: number; // ms. 좌우 홀드 후 자동 반복 시작까지. 기본 167
  arr: number; // ms. 반복 간격. 0 = 즉시 벽까지(moveToWall). 기본 33
  sdf: number; // 소프트드롭 배율. 유한값 = moveDown 반복 간격 / Infinity = softDropToFloor 1회. 기본 Infinity
};

/** Action당 복수 키 허용 (KeyboardEvent.code 기준 — 명세 §2) */
export type KeyBindings = Record<Action, string[]>;

/**
 * 입력 레이어가 호출하는 엔진 원자 조작의 구조적 계약 (명세 §4).
 *
 * `@tetorial/engine`의 `SimEngine`이 이 인터페이스를 구조적으로 만족한다 — engine은 이
 * 타입을 export하지 않으므로 소비 측인 input이 소유한다. `hardDrop`의 반환(LockInfo)은
 * 입력 레이어가 사용하지 않으므로 `void`로 좁힌다(공변 반환으로 SimEngine과 호환).
 * `currentPiece`는 큐 소진(null) 시 hardDrop을 사전 차단하기 위한 관측이다 (engine §7).
 */
export interface EngineControls {
  move(dir: -1 | 1): boolean;
  moveToWall(dir: -1 | 1): boolean;
  moveDown(): boolean;
  softDropToFloor(): boolean;
  rotate(dir: "cw" | "ccw" | "180"): boolean;
  swapHold(): boolean;
  hardDrop(): void;
  readonly currentPiece: object | null;
}

/**
 * 주입식 시각의 순수 상태 머신 (명세 §1·§4). DOM 어댑터와 분리돼 테스트는
 * 가짜 시각(`press`/`release`/`tick`의 `t`)으로만 구동한다.
 */
export interface InputCore {
  /** 키 눌림. `t`는 ms 단위 시각 */
  press(code: string, t: number): void;
  /** 키 뗌 */
  release(code: string, t: number): void;
  /** 시계 틱 (rAF 또는 테스트 수동 구동) — 경과 시간만큼 DAS/ARR/SDF 반복을 진행 */
  tick(t: number): void;
  /** 핸들링 병합 갱신 */
  configure(config: Partial<HandlingConfig>): void;
  /** 키 바인딩 병합 갱신 (제공된 Action만 교체) */
  rebind(keys: Partial<KeyBindings>): void;
  /** 전면 정지 (텍스트 포커스 중) — 게임 조작 무호출 */
  suspend(): void;
  /** 정지 해제 — 신규 입력만 유효 (정지 전 홀드 키 비복원) */
  resume(): void;
  /** 전체 키 상태 해제 (blur 시 스턱 키 방지) */
  reset(): void;
  /** 메타 액션 구독. 반환값으로 해제 */
  onMeta(cb: (action: MetaAction) => void): () => void;
}
