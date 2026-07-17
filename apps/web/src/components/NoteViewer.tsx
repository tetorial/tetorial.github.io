// 노트 열람 (m3b §4 — AW-12·13). createViewerSession 기반 보드 뷰어 — 기존 메타 전용 모달을 대체한다.
// 페이지를 prev/next로 넘기며 보드와 주석을 함께 본다. 내 노트면 "이어서 편집"으로 저작 세션에 넘긴다.
import { useEffect, useMemo, useState } from "preact/hooks";
import BoardCanvas from "./BoardCanvas.tsx";
import PiecePreview from "./PiecePreview.tsx";
import { createNoteViewer } from "../lib/note-viewer.ts";
import { buildDeepLink } from "../lib/deeplink.ts";
import { workFrame } from "../lib/view-frame.ts";
import { holdPreview, nextPreviewSlice } from "../lib/piece-preview.ts";
import type { Note } from "@tetorial/types";

interface Props {
  note: Note;
  clientId: string;
  gistId: string | null;
  /** 딥링크 fragment #p<n>의 1-기준 서수. best-effort — 부재·범위 밖이면 첫 페이지(D-20). */
  initialPage?: number | null;
  /** 내 노트면 편집 진입 핸들러, 아니면 undefined(타인 노트는 열람 전용 — AW-13). */
  onEdit?: () => void;
  onClose: () => void;
}

export default function NoteViewer({ note, clientId, gistId, initialPage, onEdit, onClose }: Props) {
  const viewer = useMemo(() => createNoteViewer(note, initialPage), [note, initialPage]);
  const [, force] = useState(0);

  useEffect(() => viewer.subscribe(() => force((n) => n + 1)), [viewer]);

  const view = viewer.view;
  const page = viewer.current;
  const total = viewer.pages.length;
  const hold = view ? holdPreview(view.hold) : null;
  const next = view ? nextPreviewSlice(view.next) : [];

  const copyLink = (): void => {
    if (!gistId) return;
    // 발신 규범(M1d-2): note는 항상 <clientId>.<noteId> 한정형, 페이지는 서수 fragment(D-20).
    const link = buildDeepLink({
      gistId,
      note: { clientId, noteId: note.id },
      page: viewer.index + 1,
    });
    void navigator.clipboard?.writeText(`${window.location.origin}${link}`);
  };

  return (
    <div class="viewer-modal" role="dialog" aria-label="노트 열람" data-testid="viewer-modal">
      <div class="vm-inner">
        <div class="vm-head">
          <h3>{note.pages[0]?.comment ?? "노트"}</h3>
          <button class="btn" onClick={onClose} aria-label="닫기">✕</button>
        </div>

        {view === null ? (
          <p class="hint" data-testid="vm-empty">페이지가 없는 노트입니다.</p>
        ) : (
          <div class="vm-body">
            <div class="vm-board">
              <div class="vm-pieces">
                <span class="vm-piece-slot">
                  홀드
                  {hold ? (
                    <PiecePreview piece={hold.piece} dimmed={hold.locked} label={`홀드 ${hold.piece}`} />
                  ) : (
                    <span class="vm-piece-empty">—</span>
                  )}
                </span>
                <span class="vm-piece-slot">
                  다음
                  {next.length > 0 ? (
                    next.map((p, i) => <PiecePreview piece={p} size={16} label={`다음 ${i + 1}번째 ${p}`} />)
                  ) : (
                    <span class="vm-piece-empty">—</span>
                  )}
                </span>
              </div>
              <BoardCanvas frame={workFrame(view)} cellSize={20} />
            </div>

            <div class="vm-side">
              <p class="hint" data-testid="vm-page-label">
                페이지 {viewer.index + 1} / {total} · 작성자 {clientId}
              </p>
              <p class="vm-comment" data-testid="vm-comment">
                {page?.comment ?? "(주석 없음)"}
              </p>
              <div class="vm-nav">
                <button
                  class="btn"
                  data-testid="vm-prev"
                  onClick={() => viewer.prev()}
                  disabled={viewer.index === 0}
                >
                  ◀ 이전
                </button>
                <button
                  class="btn"
                  data-testid="vm-next"
                  onClick={() => viewer.next()}
                  disabled={viewer.index >= total - 1}
                >
                  다음 ▶
                </button>
              </div>
            </div>
          </div>
        )}

        <div class="vm-actions">
          {onEdit && (
            <button class="btn primary" data-testid="vm-edit" onClick={onEdit}>
              이어서 편집
            </button>
          )}
          {gistId && (
            <button class="btn" onClick={copyLink} data-testid="copy-page-link">
              이 페이지 링크 복사
            </button>
          )}
        </div>
      </div>
      <style>{`
        .viewer-modal { position: fixed; inset: 0; background: rgba(0,0,0,0.4);
          display: flex; align-items: center; justify-content: center; z-index: 50; }
        .vm-inner { background: var(--color-surface); border-radius: var(--radius);
          padding: var(--space-5); max-width: 44rem; width: 92%; max-height: 92vh; overflow: auto;
          box-shadow: var(--shadow); display: grid; gap: var(--space-3); }
        .vm-head { display: flex; justify-content: space-between; align-items: center; }
        .vm-head h3 { margin: 0; }
        .vm-body { display: grid; grid-template-columns: auto 1fr; gap: var(--space-5); }
        .vm-side { display: grid; gap: var(--space-3); align-content: start; }
        .vm-pieces { display: flex; gap: var(--space-4); align-items: center; margin-bottom: var(--space-2);
          font-size: var(--text-sm); color: var(--color-text-muted); }
        .vm-piece-slot { display: flex; gap: var(--space-2); align-items: center; }
        .vm-piece-empty { font-family: var(--font-mono); }
        .vm-comment { white-space: pre-wrap; margin: 0; }
        .vm-nav, .vm-actions { display: flex; gap: var(--space-2); flex-wrap: wrap; }
        @media (max-width: 48rem) { .vm-body { grid-template-columns: 1fr; } }
      `}</style>
    </div>
  );
}
