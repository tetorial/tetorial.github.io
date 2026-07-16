// 열람 모드 — 타인/자기 노트의 페이지 순차 열람(필름스트립·딥링크 page 대응). 수정 불가(명세 §5).
import { SimEngine } from "@tetorial/engine";
import type { Note, Page } from "@tetorial/types";
import { OverlayBuffer } from "./overlays.js";
import { buildWorkView, deepClone } from "./work.js";
import type { WorkView } from "./work.js";

export interface ViewerSession {
  readonly note: Note;
  readonly pages: readonly Page[];
  readonly index: number;
  readonly current: Page | null;
  /** 현재 페이지의 렌더 뷰(보드 + 스폰된 current + ghost + next + hold + counters + overlays) */
  readonly view: WorkView | null;
  subscribe(cb: () => void): () => void;
  selectByIndex(i: number): void;
  /** 딥링크 page 파라미터 대응. 없으면 false(선택 불변) */
  selectById(pageId: string): boolean;
  next(): void;
  prev(): void;
}

class ViewerSessionImpl implements ViewerSession {
  readonly note: Note;
  #index = 0;
  readonly #listeners = new Set<() => void>();

  constructor(note: Note) {
    this.note = deepClone(note); // 원본 변형·삭제와 무관하게 자립
  }

  get pages(): readonly Page[] {
    return this.note.pages;
  }
  get index(): number {
    return this.#index;
  }
  get current(): Page | null {
    return this.note.pages[this.#index] ?? null;
  }

  get view(): WorkView | null {
    const page = this.current;
    if (!page) return null;
    // 페이지 상태로 엔진을 세워 falling·ghost·next까지 갖춘 렌더 뷰를 만든다.
    const engine = SimEngine.fromPageState(this.note.snapshot, page.state);
    const overlay = OverlayBuffer.fromHighlights(page.state.overlays?.highlights);
    return buildWorkView(engine, overlay);
  }

  subscribe(cb: () => void): () => void {
    this.#listeners.add(cb);
    return () => this.#listeners.delete(cb);
  }
  #notify(): void {
    for (const cb of this.#listeners) cb();
  }

  selectByIndex(i: number): void {
    if (i < 0 || i >= this.note.pages.length) {
      throw new RangeError(`페이지 인덱스 범위 밖: ${i}`);
    }
    this.#index = i;
    this.#notify();
  }

  selectById(pageId: string): boolean {
    const i = this.note.pages.findIndex((p) => p.id === pageId);
    if (i < 0) return false;
    this.#index = i;
    this.#notify();
    return true;
  }

  next(): void {
    if (this.#index < this.note.pages.length - 1) {
      this.#index++;
      this.#notify();
    }
  }
  prev(): void {
    if (this.#index > 0) {
      this.#index--;
      this.#notify();
    }
  }
}

export function createViewerSession(note: Note): ViewerSession {
  return new ViewerSessionImpl(note);
}
