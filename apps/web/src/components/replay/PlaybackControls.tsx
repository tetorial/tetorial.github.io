// 재생 컨트롤(버튼·배속·스크러버·마커) (ReplayIsland 분해 — M4-C AW-23, #46).
// 홀드·넥스트·카운터 표시는 M5-A에서 공통 HUD(GameHud)로 이관 — 여기는 대기 쓰레기 경고만 남는다.
import { markerRatio, type clusterMarkers } from "../../lib/markers.ts";
import type { PlaybackSession } from "../../lib/playback-session.ts";

const SPEEDS = [0.25, 0.5, 1, 2, 4];

export function PlaybackControls({
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
      <style>{STYLES}</style>
    </div>
  );
}

/** 재생 상태줄 — 홀드·넥스트·카운터는 GameHud로 이관(M5-A), 대기 쓰레기 경고만 담당. */
function PlaybackStats({ session }: { session: PlaybackSession }) {
  const v = session.view;
  return (
    <div class="pb-stats" data-testid="pb-stats">
      {v.pendingGarbage > 0 && <span class="warn">대기 쓰레기: {v.pendingGarbage}</span>}
    </div>
  );
}

const STYLES = `
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
  .pb-stats .warn { color: var(--color-warn); }
`;
