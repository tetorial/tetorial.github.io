// 시뮬레이터 배선 — 저작 세션 + input 레이어(핸들링·키·메타·suspend) (AW-5·AW-6).
// input의 EngineControls는 currentPiece를 요구하지만 sim의 controls에는 없다 — apps/web이
// session.controls + session.work.current를 합쳐 어댑터를 만든다(조립 계층의 책임).
import { createInput } from "@tetorial/input";
import type {
  EngineControls as InputControls,
  HandlingConfig,
  InputCore,
  KeyBindings,
} from "@tetorial/input";
import { createAuthoringSession, restoreAuthoringSession } from "@tetorial/sim";
import type { AuthoringSession, SerializedDraft } from "@tetorial/sim";
import type { Note, Origin, Snapshot } from "@tetorial/types";
import { generateNoteId } from "./note-id.js";

/** session.controls + work.current을 합쳐 input의 EngineControls 계약을 만족시키는 어댑터. */
function makeInputTarget(
  session: AuthoringSession,
  onLockError?: (e: unknown) => void,
): InputControls {
  const c = session.controls;
  return {
    move: (d) => c.move(d),
    moveToWall: (d) => c.moveToWall(d),
    moveDown: () => c.moveDown(),
    softDropToFloor: () => c.softDropToFloor(),
    rotate: (d) => c.rotate(d),
    swapHold: () => c.swapHold(),
    hardDrop: () => {
      // 스폰 점유 overlap 등에서 engine이 throw할 수 있다(engine §7) — tick 루프 보호.
      try {
        c.hardDrop();
      } catch (e) {
        onLockError?.(e);
      }
    },
    get currentPiece() {
      return session.work.current; // 큐 소진 시 null → input이 하드드롭 사전 차단
    },
  };
}

export interface SimulatorController {
  readonly session: AuthoringSession;
  readonly input: InputCore;
  /** 주석 입력 포커스 ↔ input.suspend/resume 배선(§3-D — 포커스 중 게임 키 정지). */
  setCommentFocus(focused: boolean): void;
  readonly suspended: boolean;
  subscribe(cb: () => void): () => void;
  /** 설정 변경 즉시 반영(AW-8). */
  applySettings(handling: HandlingConfig, keys: KeyBindings): void;
  dispose(): void;
}

export interface CreateSimulatorParams {
  handling: HandlingConfig;
  keys: KeyBindings;
  onLockError?: (e: unknown) => void;
  /** 진입: 리플레이 분기 파생(origin+snapshot) / 페이지 파생 / 자기 노트 재편집(existing). */
  init: { origin: Origin; snapshot: Snapshot; existingNoteIds?: string[] } | { existing: Note };
}

/** 저작 세션 + input을 배선한 시뮬레이터 컨트롤러를 만든다. */
export function createSimulator(params: CreateSimulatorParams): SimulatorController {
  // 신규 경로만 id를 생성해 값으로 주입 — sim은 CSPRNG 미접촉(sim-m1b §3·§6).
  // 재편집은 { existing }만 전달(id·origin·snapshot 전부 existing에서, 대조·검증 없음).
  const init =
    "existing" in params.init
      ? { existing: params.init.existing }
      : { ...params.init, noteId: generateNoteId() };
  const session = createAuthoringSession(init);
  return wireSimulator(session, params);
}

/** 드래프트에서 복원한 저작 세션으로 시뮬레이터를 만든다(AW-6). */
export function restoreSimulator(
  draft: SerializedDraft,
  params: { handling: HandlingConfig; keys: KeyBindings; onLockError?: (e: unknown) => void },
): SimulatorController {
  const session = restoreAuthoringSession(draft);
  return wireSimulator(session, params);
}

function wireSimulator(
  session: AuthoringSession,
  params: { handling: HandlingConfig; keys: KeyBindings; onLockError?: (e: unknown) => void },
): SimulatorController {
  const input = createInput(
    makeInputTarget(session, params.onLockError),
    params.handling,
    params.keys,
  );
  const offMeta = input.onMeta((action) => {
    if (action === "undo") session.undo();
    else if (action === "redo") session.redo();
    else if (action === "addPage") session.addPage();
  });
  let suspended = false;

  return {
    session,
    input,
    get suspended() {
      return suspended;
    },
    setCommentFocus(focused: boolean): void {
      if (focused) {
        input.suspend();
        suspended = true;
      } else {
        input.resume();
        suspended = false;
      }
    },
    subscribe: (cb) => session.subscribe(cb),
    applySettings(handling, keys): void {
      input.configure(handling);
      input.rebind(keys);
    },
    dispose(): void {
      offMeta();
      input.reset();
    },
  };
}

/* 업로드는 여기 없다 — 노트는 세션에서 수집함으로 확정되고(note-collection.finishNote),
   묶음 조립·단일 PUT은 note-collection.uploadCollectedNotes가 담당한다(m3b §2 — 업로드 경로는 하나다). */
