// 리플레이 페이지 핵심 아일랜드 (apps-web §2) — 재생·시뮬레이터·노트 사이드바가 상태를 공유하므로
// 하나의 아일랜드로 구성한다. 내부는 Preact 컴포넌트 트리로 분할.
// 하위 컴포넌트는 components/replay/ 하위 파일로 분해했다(M4-C AW-23, #46) — 여기는
// 오케스트레이션(상태·핸들러·조립 JSX)만 남는다.
import { useEffect, useRef, useState, useCallback } from "preact/hooks";
import { supportReport } from "@tetorial/replay-tetrio";
import BoardCanvas from "./BoardCanvas.tsx";
import GameHud from "./GameHud.tsx";
import NoteViewer from "./NoteViewer.tsx";
import SettingsPanel from "./SettingsPanel.tsx";
import SimulatorPanel, { type SimEntry } from "./SimulatorPanel.tsx";
import { EmptyState, ErrorState } from "./replay/EmptyState.tsx";
import { RoundPlayerSelect, SupportBadge } from "./replay/RoundPlayerSelect.tsx";
import { PlaybackControls } from "./replay/PlaybackControls.tsx";
import { BranchBar } from "./replay/BranchBar.tsx";
import { Sidebar, CollectedNotesBar } from "./replay/Sidebar.tsx";
import { UploadPanel, ShareBanner } from "./replay/UploadPanel.tsx";
import { parseDeepLink, buildDeepLink } from "../lib/deeplink.ts";
import { noteLimitReason } from "../lib/note-limit.ts";
import {
  collectNote,
  hasUnuploaded,
  removeCollected,
  uploadCollectedNotes,
} from "../lib/note-collection.ts";
import { canEditNote } from "../lib/note-viewer.ts";
import { takePendingReplay } from "../lib/handoff.ts";
import {
  openLocalReplay,
  openGistReplay,
  originalRound,
  type LoadedReplay,
} from "../lib/open-replay.ts";
import { WorkerError } from "../lib/worker-client.ts";
import { createPlaybackSession, type PlaybackSession } from "../lib/playback-session.ts";
import { playbackFrame } from "../lib/view-frame.ts";
import { playbackHud } from "../lib/game-hud.ts";
import { collectMarkers, clusterMarkers, type NoteFileRef } from "../lib/markers.ts";
import { applyUploadedFile, flattenSidebar, resolveNoteCandidates } from "../lib/notes-loading.ts";
import { toDisplayError, type DisplayError } from "../lib/errors.ts";
import { replayViewMode, showsPlaybackChrome } from "../lib/sim-view.ts";
import { Storage } from "../lib/storage.ts";
import { loadSettings, resetSettings } from "../lib/settings.ts";
import { applyTheme } from "../lib/theme.ts";
import { getWorkerClient } from "../lib/worker-client-factory.ts";
import type { HandlingConfig, KeyBindings } from "@tetorial/input";
import type { ThemePref } from "../lib/storage.ts";
import type { Note } from "@tetorial/types";

type Phase = "empty" | "loading" | "error" | "loaded";

export default function ReplayIsland() {
  const storage = useRef(new Storage()).current;
  const [phase, setPhase] = useState<Phase>("empty");
  const [error, setError] = useState<DisplayError | null>(null);
  const [, force] = useState(0);
  const rerender = useCallback(() => force((n) => n + 1), []);

  const loadedRef = useRef<LoadedReplay | null>(null);
  const sessionRef = useRef<PlaybackSession | null>(null);
  const [round, setRound] = useState(0);
  const [player, setPlayer] = useState(0);

  const [settings, setSettings] = useState<{ handling: HandlingConfig; keys: KeyBindings }>(() =>
    loadSettings(storage),
  );
  const [theme, setThemeState] = useState<ThemePref>(() => storage.getTheme());
  const [showSettings, setShowSettings] = useState(false);
  const [simEntry, setSimEntry] = useState<SimEntry | null>(null);
  /** 분기 불가 사유 인라인 안내(AW-22 — alert·모달 금지). 다른 조작 시 갱신·해제된다. */
  const [branchNotice, setBranchNotice] = useState<string | null>(null);
  /** 노트 수집함 — 리플레이 단위 메모리 전용. 영속화 없음(m3b §2 — 소유자 결정 2026-07-17). */
  const [collected, setCollected] = useState<Note[]>([]);
  // 업로드 결과 표시는 수집함 **밖**에 산다 — 성공하면 수집함이 비어 사라지므로, 안에 두면
  // 결과 문구가 함께 증발한다(AW-11의 "성공 문구" 요구를 무음으로 만든다).
  const [uploading, setUploading] = useState(false);
  const uploadingRef = useRef(false);
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);
  const [editKeyNotice, setEditKeyNotice] = useState(false);
  const [viewerNote, setViewerNote] = useState<{
    clientId: string;
    note: Note;
    /** 딥링크 fragment의 1-기준 페이지 서수(best-effort — M1d-3). 문맥 없으면 null. */
    page: number | null;
  } | null>(null);
  const [candidates, setCandidates] = useState<{ clientId: string; note: Note }[] | null>(null);
  const [showUpload, setShowUpload] = useState(false);
  const [shareGistId, setShareGistId] = useState<string | null>(null);

  // ── 초기 로드 (딥링크 / 핸드오프) ──────────────────────────────
  useEffect(() => {
    applyTheme(theme);
    // 경로형 딥링크(M1d-1): /replays/<replayId>는 _redirects 200 리라이트로 이 페이지가
    // 서빙되며 브라우저 URL은 원형 유지 — location 전체(pathname·search·hash)를 파싱한다.
    const link = parseDeepLink(window.location);
    if (link.gistId) {
      void loadGist(link.gistId, link);
    } else {
      void takePendingReplay().then((pending) => {
        if (pending) openLocalText(pending.text);
      });
    }
    // 최초 1회만 실행 (딥링크/핸드오프 초기화). 이후 상태는 명시 핸들러로 전이한다.
  }, []);

  const openLocalText = (text: string): void => {
    const res = openLocalReplay(text);
    if (!res.ok) {
      setError(toDisplayError(res.error));
      setPhase("error");
      return;
    }
    startLoaded(res.loaded);
  };

  const loadGist = async (
    gistId: string,
    link?: ReturnType<typeof parseDeepLink>,
  ): Promise<void> => {
    setPhase("loading");
    let worker;
    try {
      worker = getWorkerClient();
    } catch {
      // 읽기 경로의 실패다 — writes-disabled 위장 대신 전용 입력으로 정직하게 표기(AW-21).
      setError(toDisplayError({ source: "worker-unconfigured" }));
      setPhase("error");
      return;
    }
    const res = await openGistReplay(gistId, worker);
    if (!res.ok) {
      setError(toDisplayError(res.error));
      setPhase("error");
      return;
    }
    startLoaded(res.loaded);
    if (link?.noteId) openDeepLinkNote(res.loaded, link.noteId, link.clientId, link.page);
  };

  const startLoaded = (loaded: LoadedReplay): void => {
    loadedRef.current = loaded;
    setRound(0);
    setPlayer(0);
    buildSession(loaded, 0, 0);
    setPhase("loaded");
  };

  const buildSession = (loaded: LoadedReplay, r: number, p: number): void => {
    sessionRef.current?.dispose();
    sessionRef.current = createPlaybackSession(
      loaded.doc,
      { round: r, player: p },
      {
        now: () => performance.now(),
        schedule: (cb) => requestAnimationFrame(cb),
        cancel: (h) => cancelAnimationFrame(h),
      },
    );
  };

  // 미업로드 수집 노트가 있으면 이탈 시 경고만 한다(AW-15) — 수집함은 메모리 전용이라
  // 이탈하면 사라진다. 영속화(드래프트 저장)는 명시적 범위 밖(소유자 결정 2026-07-17).
  useEffect(() => {
    if (!hasUnuploaded(collected)) return;
    const onBeforeUnload = (e: BeforeUnloadEvent): void => {
      // preventDefault가 현행 규범이지만 일부 브라우저는 returnValue 설정까지 봐야 경고를 띄운다(MDN).
      // 문구는 브라우저가 정한다 — 커스텀 문자열은 무시된다.
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [collected]);

  // ── 매 프레임 재렌더 루프 (재생 중 보드·스크러버 갱신) ──────────
  const simActive = simEntry !== null;
  useEffect(() => {
    if (phase !== "loaded" || simActive) return;
    let raf = 0;
    const loop = (): void => {
      rerender();
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [phase, simActive, rerender]);

  const changeRoundPlayer = (r: number, p: number): void => {
    const loaded = loadedRef.current;
    if (!loaded) return;
    setRound(r);
    setPlayer(p);
    setBranchNotice(null); // 다른 지점으로 이동 — 지난 분기 불가 안내는 현재 상태가 아니다
    buildSession(loaded, r, p);
  };

  // 업로드 성공(POST /g) → 소스를 gist로 승격, 경로형 URL 전환(M1d-1), 공유 배너 표시(§3-B).
  const onUploaded = (gistId: string): void => {
    const loaded = loadedRef.current;
    if (loaded) loaded.source = { gistId };
    setShowUpload(false);
    setShareGistId(gistId);
    history.replaceState({}, "", buildDeepLink({ gistId }));
  };

  // ── 수집함 → 묶음 업로드 (AW-15·16·17 · 반영은 AW-11) ─────────
  const doUploadCollected = async (): Promise<void> => {
    const loaded = loadedRef.current;
    if (!loaded || typeof loaded.source === "string") {
      setUploadStatus("먼저 리플레이를 업로드해야 노트를 공유할 수 있습니다.");
      return;
    }
    // 버튼 disabled는 다음 렌더에야 걸린다 — 같은 틱의 연타가 PUT을 두 번 쏘는 것을 ref로 막는다
    // (공유 Gist에 대한 중복 쓰기 방지 — "단일 PUT"이 이 흐름의 계약이다).
    if (uploadingRef.current) return;
    uploadingRef.current = true;
    setUploading(true);
    setUploadStatus(null);
    const clientId = storage.getOrCreateClientId();
    const myFile = loaded.notesFiles.find((f) => f.clientId === clientId);
    try {
      const res = await uploadCollectedNotes({
        worker: getWorkerClient(),
        storage,
        gistId: loaded.source.gistId,
        clientId,
        notes: collected,
        files: loaded.notesFiles,
        ...(myFile?.authorName ? { authorName: myFile.authorName } : {}),
      });
      if (!res.ok) {
        setUploadStatus(
          res.code === "empty"
            ? "올릴 노트가 없습니다."
            : `한도 초과로 업로드하지 않았습니다: ${res.violations.map((v) => v.message).join("; ")}`,
        );
        return;
      }
      // 재로드 없이 사이드바 반영(AW-11) — 올린 파일을 그대로 열람 상태에 넣는다.
      loaded.notesFiles = applyUploadedFile(loaded.notesFiles, res.uploaded);
      const count = res.uploaded.notes.length;
      setCollected([]); // 업로드 성공 — 수집함을 비운다(이탈 경고 해제)
      if (res.editKeyCreated) setEditKeyNotice(true);
      // 문구는 실제 일어난 일만 서술한다(AW-11 — "사이드바가 갱신되었습니다" 거짓 표기 제거).
      setUploadStatus(`노트 ${count}개를 올렸습니다 (내 노트 파일 1개로 저장).`);
    } catch (e) {
      if (e instanceof WorkerError) {
        // 403(editKey 불일치) 등은 §6 매핑으로 정직하게 표기한다(AW-14). 수집함은 유지 — 실패했으므로.
        const d = toDisplayError({
          source: "worker",
          status: e.status,
          body: e.body,
          retryAfterMs: e.retryAfterMs,
        });
        setUploadStatus(d.detailText ? `${d.title} — ${d.detailText}` : d.title);
      } else {
        setUploadStatus("업로드에 실패했습니다.");
      }
    } finally {
      uploadingRef.current = false;
      setUploading(false);
    }
  };

  // ── 딥링크·마커 → 뷰어 ────────────────────────────────────────
  const openDeepLinkNote = (
    loaded: LoadedReplay,
    noteId: string,
    clientId: string | null,
    page: number | null,
  ): void => {
    const found = resolveNoteCandidates(loaded.notesFiles, noteId, clientId);
    if (found.length === 1) {
      setViewerNote({ ...found[0]!, page });
    } else if (found.length > 1) {
      setCandidates(found); // 충돌 → 후보 목록
    }
  };

  const session = sessionRef.current;
  const loaded = loadedRef.current;

  if (phase === "empty") {
    return <EmptyState onLocalText={openLocalText} />;
  }
  if (phase === "loading") {
    return (
      <p class="status" data-testid="loading">
        리플레이를 불러오는 중…
      </p>
    );
  }
  if (phase === "error" && error) {
    return <ErrorState error={error} onRetry={() => window.location.reload()} />;
  }
  if (!session || !loaded) return null;

  const entry = loaded.doc.rounds[round]?.[player];
  const support = entry ? supportReport(entry) : null;
  const view = session.view;

  // 마커 (현재 원본 라운드·플레이어)
  const noteFileRefs: NoteFileRef[] = loaded.notesFiles.map((f) => ({
    clientId: f.clientId,
    authorName: f.authorName,
    notes: f.notes,
  }));
  const originalRoundNum = originalRound(loaded, round);
  const markers = collectMarkers(noteFileRefs, { round: originalRoundNum, player });
  const clusters = clusterMarkers(markers);
  const myClientId = storage.peekClientId();
  const sidebar = flattenSidebar(loaded.notesFiles, myClientId);

  // 인플레이스 전환(AW-34): simEntry 활성 시 재생 영역을 편집 영역으로 교체한다 — 오버레이 모달
  // 없이 같은 자리에서 모드가 바뀐다. 재생 전용 크롬(재생 컨트롤·라운드/플레이어·업로드·분기 바·
  // 사이드바)은 편집 중 숨긴다(AW-35, showChrome=false).
  const viewMode = replayViewMode(simEntry);
  const showChrome = showsPlaybackChrome(viewMode);

  return (
    <div class="replay-layout" data-testid="replay-loaded">
      <div class="replay-main">
        {showChrome ? (
          <>
            <div class="topbar">
              <RoundPlayerSelect
                doc={loaded.doc}
                roundMap={loaded.roundMap}
                round={round}
                player={player}
                onChange={changeRoundPlayer}
              />
              <div class="topbar-actions">
                {typeof loaded.source === "string" && (
                  <button
                    class="btn primary"
                    onClick={() => setShowUpload(true)}
                    data-testid="replay-upload"
                  >
                    리플레이 업로드
                  </button>
                )}
                <button
                  class="btn"
                  onClick={() => setShowSettings((s) => !s)}
                  data-testid="open-settings"
                >
                  설정
                </button>
              </div>
            </div>

            {shareGistId && (
              <ShareBanner gistId={shareGistId} onClose={() => setShareGistId(null)} />
            )}

            {support && <SupportBadge support={support} />}

            {/* 재생 HUD(AW-29) — 위의 rAF 재렌더 루프가 보드와 함께 매 프레임 갱신한다(추가 루프 없음). */}
            <GameHud model={playbackHud(view)}>
              <BoardCanvas frame={playbackFrame(view)} />
            </GameHud>

            <PlaybackControls
              session={session}
              clusters={clusters}
              onMarkerClick={(m) => {
                const cand = resolveNoteCandidates(loaded.notesFiles, m.noteId, m.clientId);
                if (cand[0]) setViewerNote({ ...cand[0], page: null });
              }}
            />

            <BranchBar
              onBranch={() => {
                const result = session.captureBranch();
                if (!result.ok) {
                  // 실패는 여기서 인라인 안내로 소화한다(AW-22) — SimulatorPanel에는 성공만 넘어간다.
                  setBranchNotice(`분기 불가: ${result.reason}`);
                  return;
                }
                setBranchNotice(null);
                setSimEntry({
                  kind: "branch",
                  branch: result,
                  frame: session.frame,
                  round,
                  player,
                });
              }}
              hasGist={typeof loaded.source !== "string"}
              limitReason={noteLimitReason(loaded.notesFiles)}
              blockedReason={branchNotice}
            />
          </>
        ) : (
          // 편집 영역 — 재생 영역 자리에 인플레이스로 놓인다(AW-34). 종료(onExit)의 분기 프레임
          // 복귀·수집함 유지는 현행 그대로다(§3, 회귀 1순위).
          simEntry && (
            <SimulatorPanel
              storage={storage}
              loaded={loaded}
              entry={simEntry}
              collectedNoteIds={collected.map((n) => n.id)}
              settings={settings}
              onCollect={(note) => {
                setCollected((c) => collectNote(c, note));
                setUploadStatus(null); // 새로 수집했다 — 지난 업로드 결과 문구는 더 이상 현재 상태가 아니다
              }}
              onExit={() => {
                const entry = simEntry;
                setSimEntry(null);
                buildSession(loaded, round, player);
                // 분기 진입이었다면 새 세션(프레임 0)을 분기 지점으로 되돌린다(§3-D "분기 프레임 복귀", 결함3).
                if (entry.kind === "branch") sessionRef.current?.seek(entry.frame);
              }}
            />
          )
        )}

        {/* 수집함은 재생·편집 두 모드 모두에서 유지된다(§3 수집함 유지 — 회귀 1순위). */}
        {collected.length > 0 && (
          <CollectedNotesBar
            collected={collected}
            hasGist={typeof loaded.source !== "string"}
            busy={uploading}
            onRemove={(noteId) => setCollected((c) => removeCollected(c, noteId))}
            onUpload={() => void doUploadCollected()}
          />
        )}

        {/* 업로드 결과는 수집함 밖 — 성공 시 수집함이 사라져도 남는다(AW-11). */}
        {uploadStatus && (
          <p class="upload-status" role="status" data-testid="collected-status">
            {uploadStatus}
          </p>
        )}
        {editKeyNotice && (
          <p class="upload-notice" data-testid="editkey-notice">
            편집 키가 이 브라우저에 저장되었습니다. 잃어버리면 이 노트를 수정할 수 없습니다.
          </p>
        )}
      </div>

      {/* 노트 사이드바·설정은 재생 전용 크롬 — 편집 중 숨긴다(AW-35). 재편집 진입은 이 사이드바에서
          시작하므로(NoteViewer→이어서 편집) 편집 중 재진입 충돌을 원천 차단한다. */}
      {showChrome && (
        <aside class="replay-side">
          {showSettings && (
            <SettingsPanel
              handling={settings.handling}
              keys={settings.keys}
              theme={theme}
              onHandlingChange={(patch) => {
                const handling = { ...settings.handling, ...patch };
                storage.setHandling(handling);
                setSettings((s) => ({ ...s, handling }));
              }}
              onThemeChange={(t) => {
                storage.setTheme(t);
                setThemeState(t);
                applyTheme(t);
              }}
              onReset={() => setSettings(resetSettings(storage))}
              onClose={() => setShowSettings(false)}
            />
          )}

          <Sidebar
            entries={sidebar}
            onOpen={(e) => {
              const cand = resolveNoteCandidates(loaded.notesFiles, e.noteId, e.clientId);
              if (cand[0]) setViewerNote({ ...cand[0], page: null });
            }}
          />

          {candidates && candidates.length > 1 && (
            <div class="candidates" data-testid="note-candidates">
              <p>같은 노트 ID의 후보가 여러 개입니다:</p>
              <ul>
                {candidates.map((c) => (
                  <li>
                    <button
                      class="btn"
                      onClick={() => {
                        setViewerNote({ ...c, page: null });
                        setCandidates(null);
                      }}
                    >
                      {c.clientId} · {c.note.pages.length}p
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </aside>
      )}

      {showUpload && (
        <UploadPanel
          doc={loaded.doc}
          roundMap={loaded.roundMap}
          onCancel={() => setShowUpload(false)}
          onUploaded={onUploaded}
        />
      )}

      {viewerNote && (
        <NoteViewer
          note={viewerNote.note}
          clientId={viewerNote.clientId}
          gistId={typeof loaded.source === "string" ? null : loaded.source.gistId}
          initialPage={viewerNote.page}
          {...(canEditNote(
            { isMine: myClientId !== null && viewerNote.clientId === myClientId },
            typeof loaded.source !== "string",
          )
            ? {
                onEdit: (): void => {
                  // 편집 결과도 수집함을 거쳐 올라간다 — 업로드 경로는 하나다(AW-13·§2).
                  setSimEntry({ kind: "existing", note: viewerNote.note });
                  setViewerNote(null);
                },
              }
            : {})}
          onClose={() => setViewerNote(null)}
        />
      )}

      <style>{STYLES}</style>
    </div>
  );
}

/* 아일랜드 자신의 레이아웃 + 캐스케이드 보존 잔류분(M4-C AW-24).
   - .piece-slot·.piece-empty 잔류분은 GameHud 대체(M5-A)로 보존 대상이 사라져 제거했다.
   - .empty·.error-state·.status·.error-title: empty/error/loading 분기는 이 시트 밖에서 렌더되어
     현행에서도 적용되지 않는다(.status는 시뮬레이터 상태 문구에만 실효) — 동작 불변으로 잔류. */
const STYLES = `
  .replay-layout { display: grid; grid-template-columns: 1fr var(--sidebar-width); gap: var(--space-5);
    max-width: 72rem; margin: 0 auto; padding: var(--space-5) var(--space-4); }
  .replay-main { display: grid; gap: var(--space-3); }
  .topbar { display: flex; justify-content: space-between; align-items: center; }
  .topbar-actions { display: flex; gap: var(--space-2); }
  .board-canvas { border: 1px solid var(--color-border); border-radius: var(--radius-sm);
    background: var(--color-surface); display: block; }
  .upload-status { font-size: var(--text-sm); margin: 0; }
  .upload-notice { color: var(--color-warn); font-size: var(--text-sm); margin: 0; }
  .support-badge { padding: var(--space-2) var(--space-3); border-radius: var(--radius-sm);
    background: var(--color-surface-2); font-size: var(--text-sm); margin: 0; }
  .support-badge.blocked { color: var(--color-danger); }
  .support-badge.warn { color: var(--color-warn); }
  .replay-side { display: grid; gap: var(--space-4); align-content: start; }
  .empty, .error-state, .status { max-width: 40rem; margin: var(--space-8) auto; padding: 0 var(--space-4);
    display: grid; gap: var(--space-3); }
  .error-title { font-size: var(--text-lg); font-weight: 600; color: var(--color-danger); }
  .candidates { border: 1px solid var(--color-warn); border-radius: var(--radius-sm); padding: var(--space-3); }
  @media (max-width: 48rem) {
    .replay-layout { grid-template-columns: 1fr; }
  }
`;
