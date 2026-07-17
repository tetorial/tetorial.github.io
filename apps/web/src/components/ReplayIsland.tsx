// 리플레이 페이지 핵심 아일랜드 (apps-web §2) — 재생·시뮬레이터·노트 사이드바가 상태를 공유하므로
// 하나의 아일랜드로 구성한다. 내부는 Preact 컴포넌트 트리로 분할.
import { useEffect, useRef, useState, useCallback, useMemo } from "preact/hooks";
import { supportReport } from "@tetorial/replay-tetrio";
import BoardCanvas from "./BoardCanvas.tsx";
import PiecePreview from "./PiecePreview.tsx";
import NoteViewer from "./NoteViewer.tsx";
import SettingsPanel from "./SettingsPanel.tsx";
import SimulatorPanel, { type SimEntry } from "./SimulatorPanel.tsx";
import { withBase } from "../lib/base-url.ts";
import { parseDeepLink, buildDeepLink } from "../lib/deeplink.ts";
import { noteLimitReason } from "../lib/note-limit.ts";
import {
  collectNote,
  hasUnuploaded,
  removeCollected,
  uploadCollectedNotes,
} from "../lib/note-collection.ts";
import { canEditNote } from "../lib/note-viewer.ts";
import { holdPreview, nextPreviewSlice } from "../lib/piece-preview.ts";
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
import {
  applyUploadedFile,
  flattenSidebar,
  resolveNoteCandidates,
  type SidebarEntry,
} from "../lib/notes-loading.ts";
import { toDisplayError, type DisplayError } from "../lib/errors.ts";
import { Storage } from "../lib/storage.ts";
import { loadSettings, resetSettings } from "../lib/settings.ts";
import { applyTheme } from "../lib/theme.ts";
import { getWorkerClient } from "../lib/worker-client-factory.ts";
import type { HandlingConfig, KeyBindings } from "@tetorial/input";
import type { ThemePref } from "../lib/storage.ts";
import type { Note } from "@tetorial/types";

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
  const [simEntry, setSimEntry] = useState<SimEntry | null>(null);
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
        const d = toDisplayError({ source: "worker", status: e.status, body: e.body, retryAfterMs: e.retryAfterMs });
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
            setSimEntry({ kind: "branch", branch: result, frame: session.frame, round, player });
          }}
          hasGist={typeof loaded.source !== "string"}
          limitReason={noteLimitReason(loaded.notesFiles)}
        />

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

      {simEntry && (
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

/** 재생 화면 홀드·넥스트 (m3b AW-18 — renderer 프리뷰 배선. 표시 계산은 lib/piece-preview). */
function PlaybackStats({ session }: { session: PlaybackSession }) {
  const v = session.view;
  const hold = holdPreview(v.hold);
  const next = nextPreviewSlice(v.next);
  return (
    <div class="pb-stats" data-testid="pb-stats">
      <span class="piece-slot" data-testid="pb-next" data-next={next.join("")}>
        다음
        {next.length > 0 ? (
          next.map((p, i) => <PiecePreview piece={p} size={16} label={`다음 ${i + 1}번째 ${p}`} />)
        ) : (
          <span class="piece-empty">—</span>
        )}
      </span>
      <span
        class="piece-slot"
        data-testid="pb-hold"
        data-piece={hold?.piece ?? ""}
        data-locked={hold?.locked ? "true" : "false"}
      >
        홀드
        {hold ? (
          <PiecePreview piece={hold.piece} size={16} dimmed={hold.locked} label={`홀드 ${hold.piece}`} />
        ) : (
          <span class="piece-empty">—</span>
        )}
      </span>
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

/**
 * 노트 수집함 (m3b §2 — AW-15·16·17). 시뮬레이터 **밖**의 업로드 지점이다.
 * 수집 노트 전부를 파일 하나로 조립해 단일 PUT으로 올린다 — 노트 단위 업로드는 없다.
 */
function CollectedNotesBar({
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
  .pb-stats { display: flex; gap: var(--space-4); align-items: center; font-size: var(--text-sm);
    color: var(--color-text-muted); flex-wrap: wrap; }
  .pb-stats .warn, .support-badge.warn { color: var(--color-warn); }
  .piece-slot { display: flex; gap: var(--space-1); align-items: center; }
  .piece-empty { font-family: var(--font-mono); }
  .piece-preview { display: block; }
  .piece-preview.dimmed { opacity: 0.4; }
  .collected { border: 1px solid var(--color-accent); border-radius: var(--radius-sm);
    padding: var(--space-3); display: grid; gap: var(--space-2); }
  .cn-head { display: flex; justify-content: space-between; align-items: center; gap: var(--space-3); }
  .cn-list { display: grid; gap: var(--space-1); font-size: var(--text-sm); margin: 0;
    padding-left: var(--space-4); }
  .cn-list .link { background: none; border: none; color: var(--color-accent); margin-left: var(--space-2); }
  .upload-status { font-size: var(--text-sm); margin: 0; }
  .upload-notice { color: var(--color-warn); font-size: var(--text-sm); margin: 0; }
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
