// 리플레이 페이지 핵심 아일랜드 (apps-web §2) — 재생·시뮬레이터·노트 사이드바가 상태를 공유하므로
// 하나의 아일랜드로 구성한다. 내부는 Preact 컴포넌트 트리로 분할.
import { useEffect, useRef, useState, useCallback, useMemo } from "preact/hooks";
import { supportReport } from "@tetorial/replay-tetrio";
import BoardCanvas from "./BoardCanvas.tsx";
import SettingsPanel from "./SettingsPanel.tsx";
import SimulatorPanel from "./SimulatorPanel.tsx";
import { withBase } from "../lib/base-url.ts";
import { parseDeepLink, buildDeepLink, pageIndexFromOrdinal } from "../lib/deeplink.ts";
import { noteLimitReason } from "../lib/note-limit.ts";
import { takePendingReplay } from "../lib/handoff.ts";
import { openLocalReplay, openGistReplay, type LoadedReplay } from "../lib/open-replay.ts";
import {
  allRoundIndices,
  estimateUploadSize,
  buildUploadPayload,
  UPLOAD_WARN_BYTES,
} from "../lib/upload.ts";
import { WorkerError } from "../lib/worker-client.ts";
import { createPlaybackSession, type PlaybackSession } from "../lib/playback-session.ts";
import { playbackFrame } from "../lib/view-frame.ts";
import { collectMarkers, clusterMarkers, markerRatio, type NoteFileRef } from "../lib/markers.ts";
import { flattenSidebar, resolveNoteCandidates, type SidebarEntry } from "../lib/notes-loading.ts";
import { toDisplayError, type DisplayError } from "../lib/errors.ts";
import { Storage } from "../lib/storage.ts";
import { loadSettings, resetSettings } from "../lib/settings.ts";
import { applyTheme } from "../lib/theme.ts";
import { getWorkerClient } from "../lib/worker-client-factory.ts";
import type { HandlingConfig, KeyBindings } from "@tetorial/input";
import type { ThemePref } from "../lib/storage.ts";
import type { Note } from "@tetorial/types";
import type { CaptureResult } from "@tetorial/adapter-tetrio";

type Phase = "empty" | "loading" | "error" | "loaded";

const SPEEDS = [0.25, 0.5, 1, 2, 4];

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
  const [branchData, setBranchData] = useState<{ result: CaptureResult; frame: number } | null>(null);
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

  const loadGist = async (gistId: string, link?: ReturnType<typeof parseDeepLink>): Promise<void> => {
    setPhase("loading");
    let worker;
    try {
      worker = getWorkerClient();
    } catch {
      setError(toDisplayError({ source: "worker", status: 503, body: { code: "writes-disabled" } }));
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
    sessionRef.current = createPlaybackSession(loaded.doc, { round: r, player: p }, {
      now: () => performance.now(),
      schedule: (cb) => requestAnimationFrame(cb),
      cancel: (h) => cancelAnimationFrame(h),
    });
  };

  // ── 매 프레임 재렌더 루프 (재생 중 보드·스크러버 갱신) ──────────
  const simActive = branchData !== null;
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
    return <EmptyState onLocalText={openLocalText} onGist={(id) => void loadGist(id)} />;
  }
  if (phase === "loading") {
    return <p class="status" data-testid="loading">리플레이를 불러오는 중…</p>;
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
  const originalRoundNum = loaded.roundMap[round] ?? round;
  const markers = collectMarkers(noteFileRefs, { round: originalRoundNum, player });
  const clusters = clusterMarkers(markers);
  const myClientId = storage.peekClientId();
  const sidebar = flattenSidebar(loaded.notesFiles, myClientId);

  return (
    <div class="replay-layout" data-testid="replay-loaded">
      <div class="replay-main">
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
              <button class="btn primary" onClick={() => setShowUpload(true)} data-testid="replay-upload">
                리플레이 업로드
              </button>
            )}
            <button class="btn" onClick={() => setShowSettings((s) => !s)} data-testid="open-settings">
              설정
            </button>
          </div>
        </div>

        {shareGistId && (
          <ShareBanner
            gistId={shareGistId}
            onClose={() => setShareGistId(null)}
          />
        )}

        {support && <SupportBadge support={support} />}

        <BoardCanvas frame={playbackFrame(view)} />

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
              alert(`분기 불가: ${result.reason}`);
              return;
            }
            setBranchData({ result, frame: session.frame });
          }}
          hasGist={typeof loaded.source !== "string"}
          limitReason={noteLimitReason(loaded.notesFiles)}
        />
      </div>

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
                  <button class="btn" onClick={() => { setViewerNote({ ...c, page: null }); setCandidates(null); }}>
                    {c.clientId} · {c.note.pages.length}p
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </aside>

      {branchData && loaded && (
        <SimulatorPanel
          storage={storage}
          loaded={loaded}
          round={round}
          player={player}
          branch={branchData.result}
          frame={branchData.frame}
          settings={settings}
          onExit={() => {
            const branchFrame = branchData.frame;
            setBranchData(null);
            buildSession(loaded, round, player);
            // 새 세션은 프레임 0에서 시작하므로 분기 지점으로 되돌린다(§3-D "분기 프레임 복귀", 결함3).
            sessionRef.current?.seek(branchFrame);
          }}
        />
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
        <ViewerModal
          note={viewerNote.note}
          clientId={viewerNote.clientId}
          gistId={typeof loaded.source === "string" ? null : loaded.source.gistId}
          initialPage={viewerNote.page}
          onClose={() => setViewerNote(null)}
        />
      )}

      <style>{STYLES}</style>
    </div>
  );
}

/* ── 하위 컴포넌트 ────────────────────────────────────────────── */

function EmptyState({
  onLocalText,
  onGist,
}: {
  onLocalText: (text: string) => void;
  onGist: (id: string) => void;
}) {
  const [gist, setGist] = useState("");
  return (
    <div class="empty" data-testid="replay-empty">
      <p>리플레이 파일을 열어 시작하세요.</p>
      <input
        type="file"
        accept=".ttrm,.ttr,application/json"
        data-testid="replay-file-input"
        onChange={async (e) => {
          const file = (e.target as HTMLInputElement).files?.[0];
          if (file) onLocalText(await file.text());
        }}
      />
      <div class="gist-row">
        <input
          type="text"
          placeholder="gist ID"
          value={gist}
          onInput={(e) => setGist((e.target as HTMLInputElement).value)}
        />
        <button class="btn" onClick={() => gist && onGist(gist)}>
          공유 링크 열기
        </button>
      </div>
      <p><a href={withBase("/")}>← 홈으로</a></p>
    </div>
  );
}

function ErrorState({ error, onRetry }: { error: DisplayError; onRetry: () => void }) {
  return (
    <div class="error-state" role="alert" data-testid="replay-error">
      <p class="error-title">{error.title}</p>
      {error.detailText && <p class="error-detail">{error.detailText}</p>}
      {error.action.kind === "home" && <a href={withBase("/")}>홈으로 돌아가기</a>}
      {error.action.kind === "retry" && (
        <button class="btn" onClick={onRetry}>다시 시도</button>
      )}
    </div>
  );
}

function RoundPlayerSelect({
  doc,
  roundMap,
  round,
  player,
  onChange,
}: {
  doc: LoadedReplay["doc"];
  roundMap: number[];
  round: number;
  player: number;
  onChange: (r: number, p: number) => void;
}) {
  const players = doc.rounds[round] ?? [];
  return (
    <div class="rp-select">
      {doc.rounds.length > 1 && (
        <label>
          라운드
          <select
            value={round}
            data-testid="round-select"
            onChange={(e) => onChange(Number((e.target as HTMLSelectElement).value), 0)}
          >
            {doc.rounds.map((_, i) => (
              <option value={i}>R{(roundMap[i] ?? i) + 1}</option>
            ))}
          </select>
        </label>
      )}
      {players.length > 1 && (
        <label>
          플레이어
          <select
            value={player}
            data-testid="player-select"
            onChange={(e) => onChange(round, Number((e.target as HTMLSelectElement).value))}
          >
            {players.map((pl, i) => (
              <option value={i}>{pl.username || `P${i + 1}`}</option>
            ))}
          </select>
        </label>
      )}
    </div>
  );
}

function SupportBadge({ support }: { support: ReturnType<typeof supportReport> }) {
  const blocked =
    support.branch.kickset === "unsupported" || support.branch.board === "unsupported";
  const substitute = support.branch.spin === "will-substitute";
  if (!blocked && !substitute) return null;
  return (
    <p class={`support-badge ${blocked ? "blocked" : "warn"}`} data-testid="support-badge">
      {blocked
        ? "이 방 설정은 분기(시뮬레이션)가 지원되지 않습니다 (킥셋/보드)."
        : "분기 시 스핀 판정이 원본 방 설정과 다를 수 있습니다."}
    </p>
  );
}

function PlaybackControls({
  session,
  clusters,
  onMarkerClick,
}: {
  session: PlaybackSession;
  clusters: ReturnType<typeof clusterMarkers>;
  onMarkerClick: (m: { clientId: string; noteId: string }) => void;
}) {
  return (
    <div class="pb-controls">
      <div class="pb-buttons">
        <button
          class="btn"
          data-testid="play-pause"
          onClick={() => (session.playing ? session.pause() : session.play())}
        >
          {session.playing ? "⏸ 일시정지" : "▶ 재생"}
        </button>
        <button class="btn" data-testid="step-back" onClick={() => session.seek(session.frame - 1)}>
          ◀ 프레임
        </button>
        <button class="btn" data-testid="step-fwd" onClick={() => session.step(1)}>
          프레임 ▶
        </button>
        <select
          data-testid="speed-select"
          value={session.speed}
          onChange={(e) => session.setSpeed(Number((e.target as HTMLSelectElement).value))}
        >
          {SPEEDS.map((s) => (
            <option value={s}>{s}×</option>
          ))}
        </select>
        <span class="frame-label" data-testid="frame-label">
          {session.frame} / {session.totalFrames}
        </span>
      </div>

      <div class="scrubber-wrap">
        <input
          type="range"
          class="scrubber"
          min={0}
          max={session.totalFrames}
          value={session.frame}
          data-testid="scrubber"
          onInput={(e) => session.seek(Number((e.target as HTMLInputElement).value))}
        />
        {clusters.map((c) => (
          <button
            class="marker"
            data-testid="note-marker"
            style={{ left: `${markerRatio(c.frame, session.totalFrames) * 100}%` }}
            title={c.markers.map((m) => m.firstComment ?? m.noteId).join("\n")}
            onClick={() => onMarkerClick(c.markers[0]!)}
          >
            {c.markers.length > 1 ? c.markers.length : "●"}
          </button>
        ))}
      </div>

      <PlaybackStats session={session} />
    </div>
  );
}

function PlaybackStats({ session }: { session: PlaybackSession }) {
  const v = session.view;
  return (
    <div class="pb-stats" data-testid="pb-stats">
      <span>다음: {v.next.slice(0, 5).join(" ")}</span>
      <span>홀드: {v.hold.piece ?? "—"}</span>
      <span>B2B: {v.stats.b2b}</span>
      <span>combo: {v.stats.combo}</span>
      {v.pendingGarbage > 0 && <span class="warn">대기 쓰레기: {v.pendingGarbage}</span>}
    </div>
  );
}

function BranchBar({
  onBranch,
  hasGist,
  limitReason,
}: {
  onBranch: () => void;
  hasGist: boolean;
  /** 노트 합산 한도 도달 시 차단 사유(M1d-6). null이면 정상 진입. */
  limitReason: string | null;
}) {
  // 차단 지점은 신규 노트 생성 진입(분기 → 시뮬레이터 진입 버튼)이다 — apps-web-m1d §4.
  // 재편집(existing)은 노트 수가 늘지 않으므로 차단 대상이 아니다(#37의 재편집 UI에도 유지).
  return (
    <div class="branch-bar">
      <button
        class="btn primary"
        onClick={onBranch}
        disabled={limitReason !== null}
        data-testid="branch-button"
      >
        이 지점에서 시뮬레이션 (분기)
      </button>
      {limitReason !== null && (
        <span class="hint limit" role="status" data-testid="note-limit-reason">
          {limitReason}
        </span>
      )}
      {limitReason === null && !hasGist && (
        <span class="hint">노트를 공유하려면 먼저 리플레이를 업로드해야 합니다.</span>
      )}
    </div>
  );
}

function Sidebar({
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
    </div>
  );
}

function ViewerModal({
  note,
  clientId,
  gistId,
  initialPage,
  onClose,
}: {
  note: Note;
  clientId: string;
  gistId: string | null;
  /** 딥링크 fragment #p<n>의 1-기준 서수. best-effort — 부재·범위 밖이면 첫 페이지(M1d-3). */
  initialPage?: number | null;
  onClose: () => void;
}) {
  const [pageIndex, setPageIndex] = useState(() =>
    pageIndexFromOrdinal(initialPage ?? null, note.pages.length),
  );
  const copyLink = (): void => {
    if (!gistId) return;
    // 발신 규범(M1d-2): note는 항상 <clientId>.<noteId> 한정형, 페이지는 서수 fragment(§2).
    const link = buildDeepLink({
      gistId,
      note: { clientId, noteId: note.id },
      page: pageIndex + 1,
    });
    void navigator.clipboard?.writeText(`${window.location.origin}${link}`);
  };
  return (
    <div class="viewer-modal" role="dialog" data-testid="viewer-modal">
      <div class="vm-inner">
        <div class="vm-head">
          <h3>{note.pages[0]?.comment ?? "노트"}</h3>
          <button class="btn" onClick={onClose}>✕</button>
        </div>
        <p class="hint">페이지 {note.pages.length}개 · 작성자 {clientId}</p>
        <ol class="vm-pages">
          {note.pages.map((p, i) => (
            <li
              class={i === pageIndex ? "current" : ""}
              aria-current={i === pageIndex ? "true" : undefined}
              data-testid="vm-page"
              onClick={() => setPageIndex(i)}
            >
              {p.comment ?? "(주석 없음)"}
            </li>
          ))}
        </ol>
        {gistId && (
          <button class="btn" onClick={copyLink} data-testid="copy-page-link">
            이 페이지 링크 복사
          </button>
        )}
      </div>
      <style>{`
        .viewer-modal { position: fixed; inset: 0; background: rgba(0,0,0,0.4);
          display: flex; align-items: center; justify-content: center; z-index: 50; }
        .vm-inner { background: var(--color-surface); border-radius: var(--radius);
          padding: var(--space-5); max-width: 32rem; width: 90%; box-shadow: var(--shadow); }
        .vm-head { display: flex; justify-content: space-between; align-items: center; }
        .vm-pages { margin: var(--space-3) 0; }
        .vm-pages li { cursor: pointer; }
        .vm-pages li.current { font-weight: 600; color: var(--color-accent); }
      `}</style>
    </div>
  );
}

function formatKB(bytes: number): string {
  return `${(bytes / 1024).toFixed(1)} KB`;
}

function ShareBanner({ gistId, onClose }: { gistId: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  // 공유 링크는 경로형 정규형만 발신한다(M1d-1 — §2).
  const shareUrl = `${window.location.origin}${buildDeepLink({ gistId })}`;
  return (
    <div class="share-banner" data-testid="share-banner">
      <span>업로드 완료 — 공유 링크가 생성되었습니다.</span>
      <button
        class="btn"
        data-testid="copy-share"
        onClick={() => {
          void navigator.clipboard?.writeText(shareUrl);
          setCopied(true);
        }}
      >
        {copied ? "복사됨" : "공유 링크 복사"}
      </button>
      <button class="btn" onClick={onClose} aria-label="닫기">✕</button>
    </div>
  );
}

/** 업로드 플로우 (§3-B) — 라운드 발췌 다중 선택·용량 표시 → MetaFile 조립 → POST /g. */
function UploadPanel({
  doc,
  roundMap,
  onCancel,
  onUploaded,
}: {
  doc: LoadedReplay["doc"];
  roundMap: number[];
  onCancel: () => void;
  onUploaded: (gistId: string) => void;
}) {
  const [selected, setSelected] = useState<number[]>(() => allRoundIndices(doc));
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [nickname, setNickname] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const multi = doc.rounds.length > 1;

  // 용량은 실제 gzip+base64로 산출(§3-B). 선택이 비면 계산용으로 첫 라운드를 임시 사용.
  const est = useMemo(
    () => estimateUploadSize(doc, selected.length ? selected : [0]),
    [doc, selected],
  );

  const toggle = (i: number): void => {
    setSelected((s) => (s.includes(i) ? s.filter((x) => x !== i) : [...s, i].sort((a, b) => a - b)));
  };

  const submit = async (): Promise<void> => {
    if (selected.length === 0) {
      setError("최소 한 라운드를 선택하세요.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const payload = await buildUploadPayload({
        doc,
        selectedRounds: selected,
        ...(title ? { title } : {}),
        ...(description ? { description } : {}),
        ...(nickname ? { nickname } : {}),
      });
      const worker = getWorkerClient();
      const res = await worker.createReplay({ meta: payload.meta, replayBody: payload.replayBody });
      onUploaded(res.gistId);
    } catch (e) {
      if (e instanceof WorkerError) {
        setError(
          toDisplayError({ source: "worker", status: e.status, body: e.body, retryAfterMs: e.retryAfterMs }).title,
        );
      } else {
        setError("업로드에 실패했습니다. 저장 기능이 설정되지 않았을 수 있습니다.");
      }
      setBusy(false);
    }
  };

  return (
    <div class="upload-modal" role="dialog" aria-label="리플레이 업로드" data-testid="upload-panel">
      <div class="um-inner">
        <div class="um-head">
          <h2>리플레이 업로드</h2>
          <button class="btn" onClick={onCancel} aria-label="닫기">✕</button>
        </div>

        {multi && (
          <fieldset class="round-select" data-testid="upload-rounds">
            <legend>라운드 선택 (기본 전체)</legend>
            {doc.rounds.map((_, i) => (
              <label>
                <input type="checkbox" checked={selected.includes(i)} onChange={() => toggle(i)} />
                R{(roundMap[i] ?? i) + 1}
                <span class="rs-size">{formatKB(est.perRoundRawBytes[i] ?? 0)}</span>
              </label>
            ))}
          </fieldset>
        )}

        <p class="upload-size" data-testid="upload-size">
          업로드 크기 약 <strong>{formatKB(est.replayBodyBytes)}</strong>
          {est.overWarn && (
            <span class="warn"> — {formatKB(UPLOAD_WARN_BYTES)} 초과, 라운드를 줄이는 것을 권장합니다.</span>
          )}
        </p>

        <label class="um-field">
          제목
          <input
            type="text"
            value={title}
            data-testid="upload-title"
            onInput={(e) => setTitle((e.target as HTMLInputElement).value)}
          />
        </label>
        <label class="um-field">
          설명
          <input type="text" value={description} onInput={(e) => setDescription((e.target as HTMLInputElement).value)} />
        </label>
        <label class="um-field">
          닉네임
          <input type="text" value={nickname} onInput={(e) => setNickname((e.target as HTMLInputElement).value)} />
        </label>
        <p class="hint">닉네임은 인증되지 않습니다.</p>

        {error && <p class="error-detail" data-testid="upload-error">{error}</p>}

        <div class="um-actions">
          <button class="btn primary" data-testid="upload-submit" onClick={() => void submit()} disabled={busy}>
            {busy ? "업로드 중…" : "업로드"}
          </button>
          <button class="btn" onClick={onCancel} disabled={busy}>취소</button>
        </div>
      </div>
      <style>{`
        .upload-modal { position: fixed; inset: 0; background: rgba(0,0,0,0.5); z-index: 55;
          display: flex; align-items: center; justify-content: center; }
        .um-inner { background: var(--color-surface); border-radius: var(--radius); padding: var(--space-5);
          max-width: 32rem; width: 92%; max-height: 92vh; overflow: auto; box-shadow: var(--shadow);
          display: grid; gap: var(--space-3); }
        .um-head { display: flex; justify-content: space-between; align-items: center; }
        .um-head h2 { margin: 0; }
        .round-select { border: 1px solid var(--color-border); border-radius: var(--radius-sm);
          display: grid; gap: var(--space-1); padding: var(--space-2) var(--space-3); }
        .round-select label { display: flex; gap: var(--space-2); align-items: center; }
        .rs-size { color: var(--color-text-muted); font-size: var(--text-sm); margin-left: auto; }
        .um-field { display: grid; gap: var(--space-1); }
        .um-field input { padding: var(--space-1) var(--space-2); border: 1px solid var(--color-border);
          border-radius: var(--radius-sm); background: var(--color-bg); color: var(--color-text); }
        .um-actions { display: flex; gap: var(--space-2); }
      `}</style>
    </div>
  );
}

const STYLES = `
  .replay-layout { display: grid; grid-template-columns: 1fr var(--sidebar-width); gap: var(--space-5);
    max-width: 72rem; margin: 0 auto; padding: var(--space-5) var(--space-4); }
  .replay-main { display: grid; gap: var(--space-3); }
  .topbar { display: flex; justify-content: space-between; align-items: center; }
  .topbar-actions { display: flex; gap: var(--space-2); }
  .share-banner { display: flex; gap: var(--space-3); align-items: center; flex-wrap: wrap;
    padding: var(--space-2) var(--space-3); border-radius: var(--radius-sm);
    background: var(--color-surface-2); border: 1px solid var(--color-success); font-size: var(--text-sm); }
  .rp-select { display: flex; gap: var(--space-3); }
  .rp-select label { display: flex; gap: var(--space-1); align-items: center; }
  select, .gist-row input { padding: var(--space-1) var(--space-2); border: 1px solid var(--color-border);
    border-radius: var(--radius-sm); background: var(--color-bg); color: var(--color-text); }
  .board-canvas { border: 1px solid var(--color-border); border-radius: var(--radius-sm);
    background: var(--color-surface); display: block; }
  .pb-controls { display: grid; gap: var(--space-2); }
  .pb-buttons { display: flex; gap: var(--space-2); align-items: center; flex-wrap: wrap; }
  .frame-label { font-family: var(--font-mono); color: var(--color-text-muted); }
  .scrubber-wrap { position: relative; padding-top: var(--space-3); }
  .scrubber { width: 100%; }
  .marker { position: absolute; top: 0; transform: translateX(-50%); width: 1.4rem; height: 1.4rem;
    border-radius: 50%; border: none; background: var(--color-accent); color: var(--color-accent-contrast);
    font-size: 0.7rem; line-height: 1.4rem; padding: 0; }
  .pb-stats { display: flex; gap: var(--space-4); font-size: var(--text-sm); color: var(--color-text-muted); flex-wrap: wrap; }
  .pb-stats .warn, .support-badge.warn { color: var(--color-warn); }
  .support-badge { padding: var(--space-2) var(--space-3); border-radius: var(--radius-sm);
    background: var(--color-surface-2); font-size: var(--text-sm); margin: 0; }
  .support-badge.blocked { color: var(--color-danger); }
  .branch-bar { display: flex; gap: var(--space-3); align-items: center; }
  .branch-bar .hint.limit { color: var(--color-warn); }
  .btn { padding: var(--space-2) var(--space-3); border: 1px solid var(--color-border);
    border-radius: var(--radius-sm); background: var(--color-surface-2); color: var(--color-text); }
  .btn.primary { background: var(--color-accent); color: var(--color-accent-contrast); border-color: transparent; }
  .replay-side { display: grid; gap: var(--space-4); align-content: start; }
  .sidebar h2 { font-size: var(--text-lg); margin: 0 0 var(--space-2); }
  .sidebar ul { list-style: none; margin: 0; padding: 0; display: grid; gap: var(--space-2); }
  .note-item { border: 1px solid var(--color-border); border-radius: var(--radius-sm);
    padding: var(--space-2); cursor: pointer; background: var(--color-surface); }
  .note-item:hover { border-color: var(--color-accent); }
  .ni-head { display: flex; justify-content: space-between; }
  .badge { font-size: var(--text-sm); background: var(--color-success); color: #fff;
    border-radius: var(--radius-sm); padding: 0 var(--space-2); }
  .ni-meta { font-size: var(--text-sm); color: var(--color-text-muted); }
  .hint { color: var(--color-text-muted); font-size: var(--text-sm); }
  .empty, .error-state, .status { max-width: 40rem; margin: var(--space-8) auto; padding: 0 var(--space-4);
    display: grid; gap: var(--space-3); }
  .error-title { font-size: var(--text-lg); font-weight: 600; color: var(--color-danger); }
  .candidates { border: 1px solid var(--color-warn); border-radius: var(--radius-sm); padding: var(--space-3); }
  @media (max-width: 48rem) {
    .replay-layout { grid-template-columns: 1fr; }
  }
`;
