// @tetorial/input 코어 — 주입식 시각의 순수 상태 머신 (명세 docs/specs/input.md §3·§4)
// 완전 결정론: 같은 (press/release/tick, t) 열 → 같은 엔진 호출 열 (I-6).
// Date·Math.random 미사용 (시각은 전부 인자 t로 주입).
import type {
  Action,
  EngineControls,
  HandlingConfig,
  InputCore,
  KeyBindings,
  MetaAction,
} from "./types.js";

/**
 * 유한 SDF의 기준 낙하 상수 (명세 §3-3): 엔진은 무중력이므로 "500ms/칸" 낙하를 기준으로
 * sdf 배율을 환산한다 — `sdfMs = round(SDF_BASE_MS / sdf)`. 체감 조정용 단일 상수로 유지한다
 * (미결 항목: decisions.md, input QUESTIONS.md — 초기값으로 진행 후 튜닝). 런타임 설정 승격은
 * HandlingConfig 확장(명세 개정)이 필요하므로 여기서는 상수로 둔다.
 */
const SDF_BASE_MS = 500;

/** 기본 핸들링 (명세 §2·§4 — apps/web 설정 UI의 기본값 표시/초기화용 공개) */
export const DEFAULT_HANDLING: HandlingConfig = { das: 167, arr: 33, sdf: Infinity };

/**
 * 기본 바인딩 (명세 §2·§4 — 가이드라인 관례: 방향키 이동·소프트드롭, Space 하드드롭,
 * Z/X/A 회전(CCW/CW/180), C 홀드). 메타 액션 기본값은 비워 둔다 — 모디파이어 인코딩
 * ("Ctrl+KeyZ")은 DOM 어댑터가 소유하고(명세 §2), 기본 조합은 apps/web이 rebind로 주입.
 */
export const DEFAULT_KEYS: KeyBindings = {
  moveLeft: ["ArrowLeft"],
  moveRight: ["ArrowRight"],
  softDrop: ["ArrowDown"],
  hardDrop: ["Space"],
  rotateCW: ["KeyX"],
  rotateCCW: ["KeyZ"],
  rotate180: ["KeyA"],
  hold: ["KeyC"],
  undo: [],
  redo: [],
  addPage: [],
};

const ACTION_LIST = [
  "moveLeft",
  "moveRight",
  "softDrop",
  "hardDrop",
  "rotateCW",
  "rotateCCW",
  "rotate180",
  "hold",
  "undo",
  "redo",
  "addPage",
] as const satisfies readonly Action[];

/**
 * 정지(suspend) 중에도 유지되는 메타 액션 (명세 §3-4: addPage는 유지 옵션 / undo는
 * 브라우저 기본과 충돌하므로 정지). 게임 조작은 정지 중 전면 무호출.
 */
const META_KEPT_DURING_SUSPEND = new Set<MetaAction>(["addPage"]);

function isMetaAction(a: Action): a is MetaAction {
  return a === "undo" || a === "redo" || a === "addPage";
}

function cloneKeys(keys: KeyBindings): KeyBindings {
  const out = {} as KeyBindings;
  for (const action of ACTION_LIST) out[action] = [...keys[action]];
  return out;
}

class InputCoreImpl implements InputCore {
  readonly #target: EngineControls;
  #handling: HandlingConfig;
  #keys: KeyBindings;
  #suspended = false;
  readonly #metaCbs = new Set<(a: MetaAction) => void>();

  /** 현재 눌린(press 후 release 전) 키 → 그 키가 활성화한 액션들. 중복 press/OS 반복 무시에도 사용 */
  readonly #down = new Map<string, readonly Action[]>();

  /* 좌우 이동 (DAS/ARR) */
  #leftCount = 0;
  #rightCount = 0;
  #activeDir: -1 | 1 | null = null;
  #dasStart = 0;
  #arrFired = 0; // DAS 충전 이후 발사한 ARR 반복 수
  #wallFired = false; // arr===0의 moveToWall 1회 완료 표시

  /* 소프트드롭 (SDF) */
  #softCount = 0;
  #softStart = 0;
  #sdfFired = 0;

  constructor(
    target: EngineControls,
    config?: Partial<HandlingConfig>,
    keys?: Partial<KeyBindings>,
  ) {
    this.#target = target;
    this.#handling = { ...DEFAULT_HANDLING, ...config };
    this.#keys = cloneKeys(DEFAULT_KEYS);
    if (keys) this.#applyRebind(keys);
  }

  /* ── 공개 API ─────────────────────────────────────────── */

  press(code: string, t: number): void {
    if (this.#suspended) {
      // 정지 중: 유지 대상 메타 액션만 발화, 게임 조작·상태 추적 없음
      for (const action of this.#actionsFor(code)) {
        if (isMetaAction(action) && META_KEPT_DURING_SUSPEND.has(action)) this.#fireMeta(action);
      }
      return;
    }
    this.#advanceTo(t);
    if (this.#down.has(code)) return; // OS 키 반복/중복 press 무시 (event.repeat 대응, §3-2)
    const actions = this.#actionsFor(code);
    if (actions.length === 0) return; // 미바인딩 키 무시 (I-5)
    this.#down.set(code, actions);
    for (const action of actions) this.#dispatchPress(action, t);
  }

  release(code: string, t: number): void {
    if (this.#suspended) return;
    this.#advanceTo(t);
    const actions = this.#down.get(code);
    if (actions === undefined) return;
    this.#down.delete(code);
    for (const action of actions) this.#dispatchRelease(action, t);
  }

  tick(t: number): void {
    this.#advanceTo(t);
  }

  configure(config: Partial<HandlingConfig>): void {
    this.#handling = { ...this.#handling, ...config };
  }

  rebind(keys: Partial<KeyBindings>): void {
    this.#applyRebind(keys);
  }

  suspend(): void {
    this.#suspended = true;
    this.#clearKeyState(); // 정지 전 홀드 키 비복원 (§3-4, I-3)
  }

  resume(): void {
    this.#suspended = false;
  }

  reset(): void {
    this.#clearKeyState();
  }

  onMeta(cb: (action: MetaAction) => void): () => void {
    this.#metaCbs.add(cb);
    return () => {
      this.#metaCbs.delete(cb);
    };
  }

  /* ── 시간 진행 (DAS/ARR/SDF 반복) ─────────────────────── */

  #advanceTo(t: number): void {
    if (this.#suspended) return;
    this.#advanceHorizontal(t);
    this.#advanceSoft(t);
  }

  #advanceHorizontal(t: number): void {
    const dir = this.#activeDir;
    if (dir === null) return;
    const { das, arr } = this.#handling;
    const chargeAt = this.#dasStart + das;
    if (t < chargeAt) return; // DAS 미충전
    if (arr <= 0) {
      // arr===0: DAS 충전 시점에 moveToWall 1회 (§3-1, I-1)
      if (!this.#wallFired) {
        this.#target.moveToWall(dir);
        this.#wallFired = true;
      }
      return;
    }
    const due = Math.floor((t - chargeAt) / arr) + 1; // 충전 순간이 첫 반복
    while (this.#arrFired < due) {
      this.#target.move(dir);
      this.#arrFired++;
    }
  }

  #advanceSoft(t: number): void {
    if (this.#softCount === 0) return;
    if (this.#handling.sdf === Infinity) return; // ∞는 press·락 후에만 적용 (반복 없음)
    const ms = this.#sdfMs();
    if (ms <= 0) return; // 0 간격은 press에서 바닥 처리됨 (#isFloorMode)
    const due = Math.floor((t - this.#softStart) / ms);
    while (this.#sdfFired < due) {
      this.#target.moveDown();
      this.#sdfFired++;
    }
  }

  /* ── press/release 디스패치 ───────────────────────────── */

  #dispatchPress(action: Action, t: number): void {
    switch (action) {
      case "moveLeft":
        this.#dirPress(-1, t);
        break;
      case "moveRight":
        this.#dirPress(1, t);
        break;
      case "softDrop":
        this.#softPress(t);
        break;
      case "hardDrop":
        this.#hardDrop();
        break;
      case "rotateCW":
        this.#target.rotate("cw");
        break;
      case "rotateCCW":
        this.#target.rotate("ccw");
        break;
      case "rotate180":
        this.#target.rotate("180");
        break;
      case "hold":
        this.#target.swapHold();
        break;
      case "undo":
      case "redo":
      case "addPage":
        this.#fireMeta(action);
        break;
    }
  }

  #dispatchRelease(action: Action, t: number): void {
    // 회전·홀드·하드드롭·메타는 keydown 1회성 → release 무동작
    if (action === "moveLeft") this.#dirRelease(-1, t);
    else if (action === "moveRight") this.#dirRelease(1, t);
    else if (action === "softDrop") this.#softRelease();
  }

  /* ── 좌우 이동 ─────────────────────────────────────────── */

  #dirPress(dir: -1 | 1, t: number): void {
    const newlyActive = dir === -1 ? ++this.#leftCount === 1 : ++this.#rightCount === 1;
    if (newlyActive) this.#activateDir(dir, t); // last-input 우선 + DAS 재충전 (§3-1)
  }

  #dirRelease(dir: -1 | 1, t: number): void {
    const nowZero = dir === -1 ? --this.#leftCount === 0 : --this.#rightCount === 0;
    if (!nowZero) return; // 같은 방향의 다른 키가 아직 홀드 중
    if (this.#activeDir !== dir) return; // 뗀 방향이 활성이 아니면 유지
    const other = dir === -1 ? 1 : -1;
    const otherCount = other === -1 ? this.#leftCount : this.#rightCount;
    if (otherCount > 0) {
      this.#activateDir(other, t); // 남은 키로 복귀 + DAS 재충전 (§3-1, I-2)
    } else {
      this.#activeDir = null;
      this.#arrFired = 0;
      this.#wallFired = false;
    }
  }

  #activateDir(dir: -1 | 1, t: number): void {
    this.#activeDir = dir;
    this.#dasStart = t;
    this.#arrFired = 0;
    this.#wallFired = false;
    this.#target.move(dir); // keydown 즉시 1회 (§3-1)
  }

  /* ── 소프트드롭 ───────────────────────────────────────── */

  #softPress(t: number): void {
    this.#softCount++;
    if (this.#softCount !== 1) return; // 이미 홀드 중
    this.#softStart = t;
    this.#sdfFired = 0;
    if (this.#isFloorMode()) this.#target.softDropToFloor();
    else this.#target.moveDown(); // 유한값: keydown 즉시 1회 (§3-3)
  }

  #softRelease(): void {
    this.#softCount--;
    if (this.#softCount <= 0) {
      this.#softCount = 0;
      this.#sdfFired = 0;
    }
  }

  #hardDrop(): void {
    // 엔진 §7: 큐 소진 상태의 hardDrop()은 throw → currentPiece 관측으로 사전 차단
    if (this.#target.currentPiece === null) return;
    this.#target.hardDrop();
    // §3-3: SDF ∞ 홀드 중 락 이후 새 미노에도 즉시 재적용
    if (this.#softCount > 0 && this.#isFloorMode() && this.#target.currentPiece !== null) {
      this.#target.softDropToFloor();
    }
  }

  #isFloorMode(): boolean {
    return this.#handling.sdf === Infinity || this.#sdfMs() <= 0;
  }

  #sdfMs(): number {
    return Math.round(SDF_BASE_MS / this.#handling.sdf);
  }

  /* ── 내부 유틸 ────────────────────────────────────────── */

  #actionsFor(code: string): Action[] {
    const result: Action[] = [];
    for (const action of ACTION_LIST) {
      if (this.#keys[action].includes(code)) result.push(action);
    }
    return result;
  }

  #applyRebind(partial: Partial<KeyBindings>): void {
    for (const action of ACTION_LIST) {
      const v = partial[action];
      if (v !== undefined) this.#keys[action] = [...v];
    }
  }

  #fireMeta(action: MetaAction): void {
    for (const cb of this.#metaCbs) cb(action);
  }

  #clearKeyState(): void {
    this.#down.clear();
    this.#leftCount = 0;
    this.#rightCount = 0;
    this.#activeDir = null;
    this.#dasStart = 0;
    this.#arrFired = 0;
    this.#wallFired = false;
    this.#softCount = 0;
    this.#softStart = 0;
    this.#sdfFired = 0;
  }
}

/** 입력 코어 생성 (명세 §4) */
export function createInput(
  target: EngineControls,
  config?: Partial<HandlingConfig>,
  keys?: Partial<KeyBindings>,
): InputCore {
  return new InputCoreImpl(target, config, keys);
}
