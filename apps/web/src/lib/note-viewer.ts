// 노트 열람 배선 (m3b §4 — AW-12). sim의 createViewerSession을 웹의 딥링크 규약(서수 fragment)과 잇는다.
// 보드 렌더는 view-frame.workFrame으로 재사용한다 — 뷰어의 view도 저작 세션과 같은 WorkView다.
import { createViewerSession } from "@tetorial/sim";
import type { ViewerSession } from "@tetorial/sim";
import type { Note } from "@tetorial/types";
import { pageIndexFromOrdinal } from "./deeplink.js";
import type { SidebarEntry } from "./notes-loading.js";

/**
 * 노트 뷰어 세션을 만든다. initialPage는 딥링크 fragment `#p<n>`의 1-기준 서수(best-effort —
 * 부재·범위 밖이면 첫 페이지, D-20). 페이지가 0개인 노트는 선택할 것이 없으므로 그대로 둔다.
 */
export function createNoteViewer(note: Note, initialPage?: number | null): ViewerSession {
  const session = createViewerSession(note);
  const index = pageIndexFromOrdinal(initialPage ?? null, note.pages.length);
  if (index > 0) session.selectByIndex(index);
  return session;
}

/**
 * 이 노트에 "이어서 편집" 진입을 제공할지(AW-13). 자기 노트만 편집할 수 있고(editKey 소유),
 * 타인 노트는 열람 전용이다 — 같은 id upsert이므로 노트 수를 늘리지 않아 생성 한도 차단 대상이 아니다.
 * fork("이 페이지에서 시뮬레이션", AW-41)는 이와 별개다 — 내·타인 노트 모두에서 새 노트를 만들며
 * (D-8), 한도 차단 대상이다(lib/fork.ts).
 */
export function canEditNote(entry: Pick<SidebarEntry, "isMine">, hasGist: boolean): boolean {
  return entry.isMine && hasGist;
}
