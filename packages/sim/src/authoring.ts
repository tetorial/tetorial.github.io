// 저작 세션 — 노트 드래프트의 상태 머신 (명세 §3). UI 프레임워크 무관 순수 로직.
import { SimEngine } from "@tetorial/engine";
import type { Cell, LockInfo } from "@tetorial/engine";
import type { Note, Origin, Page, PageState, Snapshot } from "@tetorial/types";
import { NoteLimitError, checkNoteLimits, SERVER_FIELD_SENTINELS } from "./assemble.js";
import { makePageId } from "./ids.js";
import { OverlayBuffer } from "./overlays.js";
import { buildWorkView, captureWork, deepClone, restoreWork } from "./work.js";
import type { WorkView } from "./work.js";

/** 그리기 도구 — cell/erase는 보드, highlight는 오버레이(v2 UI, 데이터 경로만 v1) */
export type Tool = { kind: "cell"; v: Cell } | { kind: "erase" } | { kind: "highlight" };

/** PageDraft = Page (state.board가 썸네일 접근을 겸함 — 명세 §3) */
export type PageDraft = Readonly<Page>;

/** 미노 조작 — input 레이어가 호출. 엔진 API 위임 + 언두 훅(락만 언두 단위) */
export interface EngineControls {
  move(dir: -1 | 1): boolean;
  moveToWall(dir: -1 | 1): boolean;
  moveDown(): boolean;
  softDropToFloor(): boolean;
  rotate(dir: "cw" | "ccw" | "180"): boolean;
  swapHold(): boolean;
  hardDrop(): LockInfo;
  lock(): LockInfo;
}

/** localStorage 드래프트 직렬화 형태 — 무손실 왕복(S-4). gistId 키는 apps/web 책임(명세 §6) */
export interface SerializedDraft {
  v: 1;
  origin: Origin;
  snapshot: Snapshot;
  noteId: string;
  pageCounter: number;
  pages: Page[];
  selectedPageId: string | null;
  work: PageState; // 작업 상태(진행 중 보드·오버레이) — 페이지로 안 만든 상태도 보존
  undoStack: PageState[];
  redoStack: PageState[];
  dirty: boolean;
}

export interface AuthoringSession {
  readonly work: WorkView;
  readonly pages: readonly PageDraft[];
  readonly selectedPageId: string | null;
  readonly dirty: boolean;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  subscribe(cb: () => void): () => void;

  readonly controls: EngineControls;

  beginStroke(tool: Tool): void;
  strokeTo(cell: { x: number; y: number }): void;
  endStroke(): void;

  addPage(comment?: string): PageDraft;
  loadPageIntoWork(pageId: string): void;
  selectPage(pageId: string | null): void;
  deletePage(pageId: string): void;
  reorderPages(order: string[]): void;
  editComment(pageId: string, comment: string): void;

  undo(): void;
  redo(): void;

  toNote(): Note;
  serialize(): SerializedDraft;
}

const UNDO_DEPTH = 50; // 명세 §3-1 언두 깊이 상한

type StrokeState = { tool: Tool; pre: PageState; seen: Set<string>; changed: boolean };

class AuthoringSessionImpl implements AuthoringSession {
  readonly #origin: Origin;
  readonly #snapshot: Snapshot;
  readonly #noteId: string;
  #pageCounter: number;
  #engine: SimEngine;
  #overlay: OverlayBuffer;
  #pages: Page[];
  #selectedPageId: string | null;
  #undoStack: PageState[];
  #redoStack: PageState[];
  #dirty: boolean;
  #stroke: StrokeState | null = null;
  readonly #listeners = new Set<() => void>();
  readonly controls: EngineControls;

  constructor(fields: {
    origin: Origin;
    snapshot: Snapshot;
    noteId: string;
    pageCounter: number;
    engine: SimEngine;
    overlay: OverlayBuffer;
    pages: Page[];
    selectedPageId: string | null;
    undoStack: PageState[];
    redoStack: PageState[];
    dirty: boolean;
  }) {
    this.#origin = fields.origin;
    this.#snapshot = fields.snapshot;
    this.#noteId = fields.noteId;
    this.#pageCounter = fields.pageCounter;
    this.#engine = fields.engine;
    this.#overlay = fields.overlay;
    this.#pages = fields.pages;
    this.#selectedPageId = fields.selectedPageId;
    this.#undoStack = fields.undoStack;
    this.#redoStack = fields.redoStack;
    this.#dirty = fields.dirty;
    this.controls = this.#makeControls();
  }

  /* ── 관측 ─────────────────────────────────────────────── */

  get work(): WorkView {
    return buildWorkView(this.#engine, this.#overlay);
  }
  get pages(): readonly PageDraft[] {
    return this.#pages.map((p) => deepClone(p));
  }
  get selectedPageId(): string | null {
    return this.#selectedPageId;
  }
  get dirty(): boolean {
    return this.#dirty;
  }
  get canUndo(): boolean {
    return this.#undoStack.length > 0;
  }
  get canRedo(): boolean {
    return this.#redoStack.length > 0;
  }

  subscribe(cb: () => void): () => void {
    this.#listeners.add(cb);
    return () => this.#listeners.delete(cb);
  }

  #notify(): void {
    for (const cb of this.#listeners) cb();
  }

  /* ── 언두 (작업 상태 스택) ─────────────────────────────── */

  /** 커밋성 조작 직전 상태를 언두 스택에 푸시하고 리두를 무효화 */
  #pushUndo(pre: PageState): void {
    this.#undoStack.push(pre);
    if (this.#undoStack.length > UNDO_DEPTH) this.#undoStack.shift();
    this.#redoStack = [];
  }

  #applyWork(work: PageState): void {
    const { engine, overlay } = restoreWork(this.#snapshot, work);
    this.#engine = engine;
    this.#overlay = overlay;
  }

  undo(): void {
    const prev = this.#undoStack.pop();
    if (prev === undefined) return;
    this.#redoStack.push(captureWork(this.#engine, this.#overlay));
    this.#applyWork(prev);
    this.#dirty = true;
    this.#notify();
  }

  redo(): void {
    const next = this.#redoStack.pop();
    if (next === undefined) return;
    this.#undoStack.push(captureWork(this.#engine, this.#overlay));
    this.#applyWork(next);
    this.#dirty = true;
    this.#notify();
  }

  /* ── 미노 조작 (controls) ──────────────────────────────── */

  #makeControls(): EngineControls {
    // 위치 이동(move/rotate 등)은 언두 단위가 아니며(§3-1) 체크포인트에 위치가 안 남으므로 dirty도 아님.
    const positioning = (fn: () => boolean): boolean => {
      const changed = fn();
      if (changed) this.#notify();
      return changed;
    };
    // 락(hardDrop/lock)은 언두 1단위 + 내용 변경. 실패(overlap·큐 소진 throw) 시 푸시하지 않는다.
    const commitLock = (fn: () => LockInfo): LockInfo => {
      const pre = captureWork(this.#engine, this.#overlay);
      const info = fn();
      this.#pushUndo(pre);
      this.#dirty = true;
      this.#notify();
      return info;
    };
    return {
      move: (d) => positioning(() => this.#engine.move(d)),
      moveToWall: (d) => positioning(() => this.#engine.moveToWall(d)),
      moveDown: () => positioning(() => this.#engine.moveDown()),
      softDropToFloor: () => positioning(() => this.#engine.softDropToFloor()),
      rotate: (d) => positioning(() => this.#engine.rotate(d)),
      // 홀드 교환은 큐 소비·hold를 바꾸므로 내용 변경(dirty)이나, 언두 단위는 아니다(다음 락 경계로 접힘).
      swapHold: () => {
        const changed = this.#engine.swapHold();
        if (changed) {
          this.#dirty = true;
          this.#notify();
        }
        return changed;
      },
      hardDrop: () => commitLock(() => this.#engine.hardDrop()),
      lock: () => commitLock(() => this.#engine.lock()),
    };
  }

  /* ── 그리기 (스트로크 1회 = 언두 1단위) ─────────────────── */

  beginStroke(tool: Tool): void {
    this.#stroke = {
      tool,
      pre: captureWork(this.#engine, this.#overlay),
      seen: new Set(),
      changed: false,
    };
  }

  strokeTo(cell: { x: number; y: number }): void {
    const s = this.#stroke;
    if (!s) return;
    const key = `${cell.x},${cell.y}`;
    if (s.seen.has(key)) return; // 중복 셀 자동 무시(명세 §3)
    s.seen.add(key);
    if (s.tool.kind === "highlight") {
      if (this.#overlay.set(cell.x, cell.y, true)) s.changed = true;
    } else if (cell.x >= 0 && cell.x < 10 && cell.y >= 0 && cell.y < 40) {
      const v: Cell = s.tool.kind === "erase" ? "_" : s.tool.v;
      this.#engine.setCells([{ x: cell.x, y: cell.y, v }]);
      s.changed = true;
    }
    this.#notify();
  }

  endStroke(): void {
    const s = this.#stroke;
    this.#stroke = null;
    if (!s) return;
    if (s.changed) {
      this.#pushUndo(s.pre);
      this.#dirty = true;
    }
    this.#notify();
  }

  /* ── 페이지 (CRUD는 언두 스택과 분리 — 명세 §3-1) ────────── */

  #freshPageId(): string {
    let id: string;
    do {
      id = makePageId(this.#noteId, this.#pageCounter++);
    } while (this.#pages.some((p) => p.id === id));
    return id;
  }

  addPage(comment?: string): PageDraft {
    const state = captureWork(this.#engine, this.#overlay);
    const id = this.#freshPageId();
    const page: Page =
      comment !== undefined && comment !== "" ? { id, state, comment } : { id, state };
    this.#pages.push(page);
    this.#dirty = true;
    this.#notify();
    return deepClone(page);
  }

  loadPageIntoWork(pageId: string): void {
    const page = this.#pages.find((p) => p.id === pageId);
    if (!page) throw new Error(`페이지를 찾을 수 없음: ${pageId}`);
    const pre = captureWork(this.#engine, this.#overlay);
    const { engine, overlay } = restoreWork(this.#snapshot, page.state);
    this.#engine = engine;
    this.#overlay = overlay;
    this.#pushUndo(pre); // 불러오기는 언두 1단위(명세 §3-1)
    this.#dirty = true;
    this.#notify();
  }

  selectPage(pageId: string | null): void {
    if (pageId !== null && !this.#pages.some((p) => p.id === pageId)) {
      throw new Error(`페이지를 찾을 수 없음: ${pageId}`);
    }
    this.#selectedPageId = pageId; // 미리보기만 — 작업 상태 불변, dirty 아님
    this.#notify();
  }

  deletePage(pageId: string): void {
    const idx = this.#pages.findIndex((p) => p.id === pageId);
    if (idx < 0) return;
    this.#pages.splice(idx, 1);
    if (this.#selectedPageId === pageId) this.#selectedPageId = null;
    this.#dirty = true;
    this.#notify();
  }

  reorderPages(order: string[]): void {
    const current = new Set(this.#pages.map((p) => p.id));
    if (order.length !== this.#pages.length || !order.every((id) => current.has(id))) {
      throw new Error("reorderPages: order는 현재 페이지 id의 순열이어야 한다");
    }
    const byId = new Map(this.#pages.map((p) => [p.id, p]));
    this.#pages = order.map((id) => byId.get(id)!);
    this.#dirty = true;
    this.#notify();
  }

  editComment(pageId: string, comment: string): void {
    const page = this.#pages.find((p) => p.id === pageId);
    if (!page) throw new Error(`페이지를 찾을 수 없음: ${pageId}`);
    if (comment === "") delete page.comment;
    else page.comment = comment;
    this.#dirty = true;
    this.#notify();
  }

  /* ── 직렬화 ──────────────────────────────────────────── */

  toNote(): Note {
    const note: Note = {
      id: this.#noteId,
      origin: deepClone(this.#origin),
      snapshot: deepClone(this.#snapshot),
      pages: deepClone(this.#pages),
      createdAt: SERVER_FIELD_SENTINELS.timestamp,
      updatedAt: SERVER_FIELD_SENTINELS.timestamp,
    };
    const violations = checkNoteLimits(note);
    if (violations.length > 0) throw new NoteLimitError(violations);
    return note;
  }

  serialize(): SerializedDraft {
    return {
      v: 1,
      origin: deepClone(this.#origin),
      snapshot: deepClone(this.#snapshot),
      noteId: this.#noteId,
      pageCounter: this.#pageCounter,
      pages: deepClone(this.#pages),
      selectedPageId: this.#selectedPageId,
      work: captureWork(this.#engine, this.#overlay),
      undoStack: deepClone(this.#undoStack),
      redoStack: deepClone(this.#redoStack),
      dirty: this.#dirty,
    };
  }
}

/** 주입된 노트 id의 거부 계약 (명세 sim-m1b §3 — API의 일부). 세션은 생성되지 않는다. */
export class InvalidNoteIdError extends Error {
  readonly reason: "shape" | "collision";
  constructor(reason: "shape" | "collision", message: string) {
    super(message);
    this.name = "InvalidNoteIdError";
    this.reason = reason;
  }
}

// note id 규격 — 유일 출처는 @tetorial/types notes 스키마(notes.ts idSchema)다.
// 미공개 심볼이라 리터럴을 둔다. M1c에서 공개 상수 승격 검토 (sim-m1b §3).
const NOTE_ID_SHAPE = /^[A-Za-z0-9_-]{8}$/;

/**
 * 저작 세션 생성 — 자기 노트 재편집(existing) 또는 신규(origin+snapshot+noteId 주입).
 * 신규 경로만 입구 방어: 형식 불일치·existingNoteIds 충돌 시 InvalidNoteIdError throw.
 * 재편집 경로는 어떤 대조·검증도 하지 않는다 — 자기 id는 기존 목록에 당연히 있다 (sim-m1b §3).
 */
export function createAuthoringSession(
  init:
    | { existing: Note } // 재편집: id·origin·snapshot 전부 existing에서
    | {
        origin: Origin;
        snapshot: Snapshot;
        noteId: string; // 신규: 호출자가 값으로 주입 (sim은 CSPRNG 미접촉 — id는 받기만 한다)
        existingNoteIds?: string[]; // 대상 파일의 기존 id 목록 — 충돌 1회 대조용
      },
): AuthoringSession {
  let origin: Origin;
  let snapshot: Snapshot;
  let noteId: string;
  let pages: Page[];
  if ("existing" in init) {
    ({ origin, snapshot, id: noteId } = init.existing);
    pages = deepClone(init.existing.pages);
  } else {
    if (!NOTE_ID_SHAPE.test(init.noteId)) {
      throw new InvalidNoteIdError("shape", `noteId 형식 위반 ([A-Za-z0-9_-]{8}): ${init.noteId}`);
    }
    if (init.existingNoteIds?.includes(init.noteId)) {
      throw new InvalidNoteIdError("collision", `noteId가 기존 id와 충돌: ${init.noteId}`);
    }
    ({ origin, snapshot, noteId } = init);
    pages = [];
  }
  return new AuthoringSessionImpl({
    origin: deepClone(origin),
    snapshot: deepClone(snapshot),
    noteId,
    pageCounter: 0,
    engine: SimEngine.fromSnapshot(snapshot),
    overlay: OverlayBuffer.empty(),
    pages,
    selectedPageId: null,
    undoStack: [],
    redoStack: [],
    dirty: false,
  });
}

/** 드래프트 복원 (명세 §3 `AuthoringSession.restore` 대응 — QUESTIONS.md Q3) */
export function restoreAuthoringSession(draft: SerializedDraft): AuthoringSession {
  const { engine, overlay } = restoreWork(draft.snapshot, draft.work);
  return new AuthoringSessionImpl({
    origin: deepClone(draft.origin),
    snapshot: deepClone(draft.snapshot),
    noteId: draft.noteId,
    pageCounter: draft.pageCounter,
    engine,
    overlay,
    pages: deepClone(draft.pages),
    selectedPageId: draft.selectedPageId,
    undoStack: deepClone(draft.undoStack),
    redoStack: deepClone(draft.redoStack),
    dirty: draft.dirty,
  });
}
