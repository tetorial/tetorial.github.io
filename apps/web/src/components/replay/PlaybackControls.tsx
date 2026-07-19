// 재생 컨트롤(버튼·배속·스크러버·마커) (ReplayIsland 분해 — M4-C AW-23, #46).
// 홀드·넥스트·카운터 표시는 M5-A에서 공통 HUD(GameHud)로 이관 — 여기는 대기 쓰레기 경고만 남는다.
import {
  markerRatio,
  markerLabel,
  clusterInteraction,
  type clusterMarkers,
} from "../../lib/markers.ts";
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
        {clusters.map((c) => {
          const left = `${markerRatio(c.frame, session.totalFrames) * 100}%`;
          const it = clusterInteraction(c);
          // 단일 노트(AW-44): 화살촉 마커 클릭 시 즉시 열기 — 현행 유지.
          if (it.mode === "single") {
            return (
              <span class="marker-anchor" style={{ left }}>
                <button
                  class="marker"
                  data-testid="note-marker"
                  aria-label={markerLabel(it.marker)}
                  onClick={() => onMarkerClick(it.marker)}
                >
                  ●
                </button>
              </span>
            );
          }
          // 클러스터(AW-44): 호버·키보드 포커스 시 드롭다운으로 노트를 선택해 연다.
          // 화살촉 마커는 트리거(개수 표시)이고, 실제 열기는 항목이 담당한다.
          return (
            <span class="marker-anchor marker-cluster" style={{ left }}>
              <button
                class="marker"
                data-testid="note-marker"
                aria-haspopup="menu"
                aria-label={`노트 ${it.items.length}개`}
              >
                {it.items.length}
              </button>
              <ul class="marker-menu" role="menu">
                {it.items.map((m) => (
                  <li role="none">
                    <button
                      class="marker-item"
                      role="menuitem"
                      data-testid="note-marker-item"
                      onClick={() => onMarkerClick(m)}
                    >
                      {markerLabel(m)}
                    </button>
                  </li>
                ))}
              </ul>
            </span>
          );
        })}
      </div>

      <PlaybackStats session={session} />
      <style>{STYLES}</style>
    </div>
  );
}

/** 재생 상태줄 — 홀드·넥스트·카운터는 GameHud로 이관(M5-A), 대기 쓰레기 경고만 담당.
    양보드(M6-B)는 보드별 대기 쓰레기를 각각 표시한다(플레이어 라벨은 2개 이상일 때만). */
function PlaybackStats({ session }: { session: PlaybackSession }) {
  const dual = session.boards.length > 1;
  return (
    <div class="pb-stats" data-testid="pb-stats">
      {session.boards.map(
        (b) =>
          b.view.pendingGarbage > 0 && (
            <span class="warn">
              대기 쓰레기{dual ? ` P${b.player + 1}` : ""}: {b.view.pendingGarbage}
            </span>
          ),
      )}
    </div>
  );
}

// 스타일 계약(형태 AW-42·43)을 유닛에서 대조 가능하게 export한다 — 실렌더 관측은 e2e/m6c-markers.
export const STYLES = `
  .pb-controls { display: grid; gap: var(--space-2); }
  .pb-buttons { display: flex; gap: var(--space-2); align-items: center; flex-wrap: wrap; }
  .frame-label { font-family: var(--font-mono); color: var(--color-text-muted); }
  .scrubber-wrap { position: relative; padding-top: var(--space-4); }

  /* AW-42 재생 슬라이더 핸들 — 원형 네이티브 핸들을 세로 직사각형으로 교체.
     트랙·핸들 모두 토큰 색으로 마커와 한 시각 언어로 묶는다. */
  .scrubber { -webkit-appearance: none; appearance: none; width: 100%; height: 0.4rem;
    background: var(--color-surface-2); border-radius: var(--radius-sm); outline-offset: 3px; }
  .scrubber::-webkit-slider-thumb { -webkit-appearance: none; appearance: none;
    width: 0.55rem; height: 1.4rem; border-radius: 2px; border: none;
    background: var(--color-accent); cursor: pointer; }
  .scrubber::-moz-range-thumb { width: 0.55rem; height: 1.4rem; border-radius: 2px; border: none;
    background: var(--color-accent); cursor: pointer; }
  .scrubber::-moz-range-track { height: 0.4rem; background: var(--color-surface-2);
    border-radius: var(--radius-sm); }

  .marker-anchor { position: absolute; top: 0; transform: translateX(-50%); }
  .marker-cluster:hover, .marker-cluster:focus-within { z-index: 3; }

  /* AW-43 노트 마커 — 원형 대신 위로 뾰족한 화살촉(교체 가능, 게이트 11항 소유자 판정).
     슬라이더 핸들과 같은 토큰 색·크기 체계. 클러스터 개수는 하단부에 계속 표시된다. */
  .marker { display: block; width: 1.4rem; height: 1.6rem; padding: 0.6rem 0 0; border: none;
    background: var(--color-accent); color: var(--color-accent-contrast);
    clip-path: polygon(50% 0, 100% 38%, 100% 100%, 0 100%, 0 38%);
    font-size: 0.7rem; line-height: 1; text-align: center; }
  .marker-cluster > .marker { cursor: default; }

  /* AW-44 클러스터 드롭다운 — 호버/포커스 시에만 노출, 항목 클릭으로 해당 노트를 연다. */
  .marker-menu { position: absolute; top: 1.7rem; left: 50%; transform: translateX(-50%);
    display: none; margin: 0; padding: var(--space-1); list-style: none; min-width: 8rem;
    max-width: 16rem; background: var(--color-surface); border: 1px solid var(--color-border);
    border-radius: var(--radius-sm); box-shadow: var(--shadow); }
  .marker-cluster:hover .marker-menu, .marker-cluster:focus-within .marker-menu { display: block; }
  .marker-item { display: block; width: 100%; text-align: left; border: none; background: none;
    color: var(--color-text); padding: var(--space-1) var(--space-2); border-radius: var(--radius-sm);
    font-size: var(--text-sm); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .marker-item:hover, .marker-item:focus { background: var(--color-surface-2); }
  .pb-stats { display: flex; gap: var(--space-4); align-items: center; font-size: var(--text-sm);
    color: var(--color-text-muted); flex-wrap: wrap; }
  .pb-stats .warn { color: var(--color-warn); }
`;
