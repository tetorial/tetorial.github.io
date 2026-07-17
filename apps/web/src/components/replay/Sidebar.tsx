// 노트 사이드바 + 노트 수집함 (ReplayIsland 분해 — M4-C AW-23, #46).
import type { SidebarEntry } from "../../lib/notes-loading.ts";
import type { Note } from "@tetorial/types";

export function Sidebar({
  entries,
  onOpen,
}: {
  entries: SidebarEntry[];
  onOpen: (e: SidebarEntry) => void;
}) {
  return (
    <div class="sidebar" data-testid="notes-sidebar">
      <h2>노트 ({entries.length})</h2>
      {entries.length === 0 && <p class="hint">아직 노트가 없습니다.</p>}
      <ul>
        {entries.map((e) => (
          <li class="note-item" onClick={() => onOpen(e)} data-testid="note-item">
            <div class="ni-head">
              <span class="ni-author">{e.authorName ?? "익명"}</span>
              {e.isMine && <span class="badge">내 것</span>}
            </div>
            <div class="ni-meta">{e.pageCount}p · {e.firstComment ?? "(주석 없음)"}</div>
          </li>
        ))}
      </ul>
      <style>{SIDEBAR_STYLES}</style>
    </div>
  );
}

/**
 * 노트 수집함 (m3b §2 — AW-15·16·17). 시뮬레이터 **밖**의 업로드 지점이다.
 * 수집 노트 전부를 파일 하나로 조립해 단일 PUT으로 올린다 — 노트 단위 업로드는 없다.
 */
export function CollectedNotesBar({
  collected,
  hasGist,
  busy,
  onRemove,
  onUpload,
}: {
  collected: Note[];
  hasGist: boolean;
  busy: boolean;
  onRemove: (noteId: string) => void;
  onUpload: () => void;
}) {
  return (
    <div class="collected" data-testid="collected-notes">
      <div class="cn-head">
        <strong>수집한 노트 {collected.length}개</strong>
        <button
          class="btn primary"
          data-testid="upload-collected"
          onClick={onUpload}
          disabled={busy || !hasGist}
        >
          {busy ? "업로드 중…" : "모두 업로드"}
        </button>
      </div>
      <ul class="cn-list">
        {collected.map((n, i) => (
          <li data-testid="collected-item">
            {i + 1}. {n.pages[0]?.comment ?? "(주석 없음)"} · {n.pages.length}p
            <button class="link" data-testid="collected-remove" onClick={() => onRemove(n.id)}>
              빼기
            </button>
          </li>
        ))}
      </ul>
      {!hasGist && <p class="hint">노트를 공유하려면 먼저 리플레이를 업로드해야 합니다.</p>}
      <p class="hint">아직 올리지 않았습니다 — 페이지를 떠나면 수집한 노트는 사라집니다.</p>
      <style>{COLLECTED_STYLES}</style>
    </div>
  );
}

const SIDEBAR_STYLES = `
  .sidebar h2 { font-size: var(--text-lg); margin: 0 0 var(--space-2); }
  .sidebar ul { list-style: none; margin: 0; padding: 0; display: grid; gap: var(--space-2); }
  .note-item { border: 1px solid var(--color-border); border-radius: var(--radius-sm);
    padding: var(--space-2); cursor: pointer; background: var(--color-surface); }
  .note-item:hover { border-color: var(--color-accent); }
  .ni-head { display: flex; justify-content: space-between; }
  .badge { font-size: var(--text-sm); background: var(--color-success); color: #fff;
    border-radius: var(--radius-sm); padding: 0 var(--space-2); }
  .ni-meta { font-size: var(--text-sm); color: var(--color-text-muted); }
`;

// 수집함은 조건부 렌더 — 스타일은 컴포넌트 자신의 <style>로 동반한다(m4c §3 <style> 누락 함정 주의).
const COLLECTED_STYLES = `
  .collected { border: 1px solid var(--color-accent); border-radius: var(--radius-sm);
    padding: var(--space-3); display: grid; gap: var(--space-2); }
  .cn-head { display: flex; justify-content: space-between; align-items: center; gap: var(--space-3); }
  .cn-list { display: grid; gap: var(--space-1); font-size: var(--text-sm); margin: 0;
    padding-left: var(--space-4); }
`;
