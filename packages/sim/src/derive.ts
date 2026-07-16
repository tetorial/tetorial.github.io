// 파생 진입 — "이 페이지에서 시뮬레이션". notes 스키마 §4 재시뮬레이션 규범을 그대로 구현(명세 §5·S-5).
import type { Note, Origin, Snapshot } from "@tetorial/types";
import { deepClone } from "./work.js";

/**
 * 페이지 상태에서 새 진입 스냅샷을 파생한다(비정규화 — 새 노트도 자기완결).
 *   board/current/hold/holdLocked/counters ← page.state
 *   queue   ← note.snapshot.queue.slice(page.state.queueUsed)
 *   ruleset ← note.snapshot.ruleset 복사
 *   origin  ← { type:"note", clientId: sourceClientId, noteId, pageId }
 * current가 null(큐 소진 페이지)이면 진입 불가.
 *
 * @param sourceClientId 대상 노트가 속한 파일의 clientId — origin.note.clientId 구성용.
 *   (명세 §5 시그니처에는 누락되어 있어 인자로 받는다 — QUESTIONS.md Q2)
 */
export function deriveSnapshotFromPage(
  note: Note,
  pageId: string,
  sourceClientId: string,
): { snapshot: Snapshot; origin: Origin } | { error: "queue-exhausted" } {
  const page = note.pages.find((p) => p.id === pageId);
  if (!page) throw new Error(`페이지를 찾을 수 없음: ${pageId}`);
  if (page.state.current === null) return { error: "queue-exhausted" };

  // 전부 깊은 복제 — 원본 노트를 이후 변형·삭제해도 파생 결과는 무영향(S-5)
  const snapshot: Snapshot = {
    ruleset: deepClone(note.snapshot.ruleset),
    board: deepClone(page.state.board),
    current: page.state.current,
    hold: page.state.hold,
    holdLocked: page.state.holdLocked,
    queue: note.snapshot.queue.slice(page.state.queueUsed),
    counters: { ...page.state.counters },
  };
  const origin: Origin = {
    type: "note",
    clientId: sourceClientId,
    noteId: note.id,
    pageId,
  };
  return { snapshot, origin };
}
