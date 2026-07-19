// 노트 열람 (m3b §4 — AW-12·13). createViewerSession 기반 보드 뷰어 — 기존 메타 전용 모달을 대체한다.
// 페이지를 prev/next로 넘기며 보드와 주석을 함께 본다. 내 노트면 "이어서 편집"으로 저작 세션에 넘긴다.
import { useEffect, useMemo, useState } from "preact/hooks";
import BoardCanvas from "./BoardCanvas.tsx";
import GameHud from "./GameHud.tsx";
import { createNoteViewer } from "../lib/note-viewer.ts";
import { buildDeepLink } from "../lib/deeplink.ts";
import { workFrame } from "../lib/view-frame.ts";
import { workHud } from "../lib/game-hud.ts";
import type { Note } from "@tetorial/types";

interface Props {
  note: Note;
  clientId: string;
  gistId: string | null;
  /** 딥링크 fragment #p<n>의 1-기준 서수. best-effort — 부재·범위 밖이면 첫 페이지(D-20). */
  initialPage?: number | null;
  /** 내 노트면 편집 진입 핸들러, 아니면 undefined(타인 노트는 열람 전용 — AW-13). */
  onEdit?: () => void;
  /** 현재 페이지에서 fork(새 노트) 진입(AW-41). 내·타인 노트 모두 노출 — 진입 실패 시 안내
      문구를 반환해 인라인 표시하고(queue-exhausted 등), 성공 시 null(부모가 뷰어를 닫는다). */
  onFork?: (pageId: string) => string | null;
  /** 노트 합산 한도 도달 시 fork 차단 사유(분기와 동일 적용 — AW-41). null이면 정상 진입. */
  forkLimitReason?: string | null;
  onClose: () => void;
}

export default function NoteViewer({
  note,
  clientId,
  gistId,
  initialPage,
  onEdit,
  onFork,
  forkLimitReason,
  onClose,
}: Props) {
  const viewer = useMemo(() => createNoteViewer(note, initialPage), [note, initialPage]);
  const [, force] = useState(0);
  /** fork 진입 실패 인라인 안내(AW-41 — alert·모달 금지). 페이지 이동 시 해제된다. */
  const [forkNotice, setForkNotice] = useState<string | null>(null);

  useEffect(() => viewer.subscribe(() => force((n) => n + 1)), [viewer]);

  // 페이지가 바뀌면 지난 안내(특정 페이지의 queue-exhausted 등)는 현재 상태가 아니다 — 해제한다.
  useEffect(() => {
    setForkNotice(null);
  }, [viewer.index]);

  const view = viewer.view;
  const page = viewer.current;
  const total = viewer.pages.length;

  // fork 진입(AW-41) — 현재 페이지를 부모에 넘긴다. 성공이면 부모가 뷰어를 닫고, 실패면(한도·
  // queue-exhausted) 반환된 문구를 인라인 안내로 표시한다(뷰어는 정상 유지).
  const doFork = (): void => {
    if (!onFork || !page) return;
    setForkNotice(onFork(page.id));
  };

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
              {/* 공통 HUD(AW-26) — 뷰어의 view도 WorkView라 시뮬레이터와 같은 workHud를 탄다. */}
              <GameHud model={workHud(view)}>
                <BoardCanvas frame={workFrame(view)} cellSize={20} />
              </GameHud>
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
          {/* fork는 내·타인 노트 모두에서 가능하다(D-8) — "이어서 편집"(내 노트 한정)과 공존한다.
              페이지가 있을 때만 노출한다(view===null이면 fork할 페이지가 없다). */}
          {onFork && view !== null && (
            <button
              class="btn"
              data-testid="vm-fork"
              onClick={doFork}
              disabled={forkLimitReason != null}
            >
              이 페이지에서 시뮬레이션
            </button>
          )}
          {gistId && (
            <button class="btn" onClick={copyLink} data-testid="copy-page-link">
              이 페이지 링크 복사
            </button>
          )}
        </div>
        {/* 진입 차단 안내는 인라인(AW-41·AW-22). 한도(상시)·queue-exhausted(클릭 시) 모두 여기 표기. */}
        {(forkLimitReason != null || forkNotice) && (
          <p class="vm-fork-notice" role="status" data-testid="vm-fork-notice">
            {forkLimitReason ?? forkNotice}
          </p>
        )}
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
        .vm-comment { white-space: pre-wrap; margin: 0; }
        .vm-fork-notice { color: var(--color-warn); font-size: var(--text-sm); margin: 0; }
        .vm-nav, .vm-actions { display: flex; gap: var(--space-2); flex-wrap: wrap; }
        @media (max-width: 48rem) { .vm-body { grid-template-columns: 1fr; } }
      `}</style>
    </div>
  );
}
