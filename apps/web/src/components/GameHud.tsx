// 공통 게임 HUD (m5-a §2·§3 — AW-26·27·28). 재생·시뮬레이터·노트 뷰어가 공유하는 Hold/Next/카운터
// 표시. 레이아웃 규범: Hold=보드 왼쪽 · Next=보드 오른쪽 세로(next[0] 맨 위) · 상단 정렬 ·
// 미노는 정사각 박스 · "홀드"/"다음" 텍스트 레이블 없음(위치로 식별, 접근성은 aria-label) ·
// B2B/Combo는 Next 열 아래(이름 위·숫자 아래, 굵게). 표시 계산은 lib/game-hud.ts — 여기는
// DOM 배치와 data 속성 관측만. 미노 아이콘은 기존 PiecePreview(renderer 배선, RD-4) 재사용.
import PiecePreview from "./PiecePreview.tsx";
import type { ComponentChildren } from "preact";
import type { HudModel } from "../lib/game-hud.ts";

interface Props {
  model: HudModel;
  /** 보드 캔버스 — HUD가 보드를 사이에 두는 3열 구성의 가운데 열. */
  children: ComponentChildren;
}

// 박스는 정사각, 아이콘 캔버스는 4×2 격자 비율(PiecePreview) — 박스 한 변을 캔버스 폭(size×4)에
// 맞춰 아이콘이 중앙에 온다. 홀드 4rem(아이콘 16px), 넥스트 3.5rem(아이콘 14px).
const HOLD_ICON = 16;
const NEXT_ICON = 14;

export default function GameHud({ model, children }: Props) {
  const { hold, next, counters } = model;
  const b2b = counters.find((c) => c.label === "B2B");
  const combo = counters.find((c) => c.label === "Combo");
  return (
    <div class="game-hud">
      {/* 그래픽 표기라 상태가 텍스트로 남지 않는다 — data 속성이 e2e·게이트 11의 관측 신호(§4). */}
      <div
        class="hud-box hud-hold"
        data-testid="hud-hold"
        data-piece={hold?.piece ?? ""}
        data-locked={hold?.locked ? "true" : "false"}
        role={hold ? undefined : "img"}
        aria-label={hold ? undefined : "홀드 비어 있음"}
      >
        {hold && (
          <PiecePreview
            piece={hold.piece}
            size={HOLD_ICON}
            dimmed={hold.locked}
            label={`홀드 ${hold.piece}${hold.locked ? " (잠김)" : ""}`}
          />
        )}
      </div>

      <div class="hud-board">{children}</div>

      <div class="hud-right">
        <div class="hud-next" data-testid="hud-next" data-next={next.join("")}>
          {next.map((p, i) => (
            <div class="hud-box">
              <PiecePreview piece={p} size={NEXT_ICON} label={`다음 ${i + 1}번째 ${p}`} />
            </div>
          ))}
        </div>
        {/* 컨테이너는 항상 렌더 — 비표시 카운터는 data 속성이 없다(§4 관측 규약). */}
        <div
          class="hud-counters"
          data-testid="hud-counters"
          data-b2b={b2b ? String(b2b.value) : undefined}
          data-combo={combo ? String(combo.value) : undefined}
        >
          {counters.map((c) => (
            <div class="hud-counter" aria-label={`${c.label} ${c.value}`}>
              <span class="hud-counter-label">{c.label}</span>
              <span class="hud-counter-value">{c.value}</span>
            </div>
          ))}
        </div>
      </div>

      <style>{`
        .game-hud { display: flex; align-items: flex-start; gap: var(--space-3); }
        .hud-board { flex: none; }
        .hud-box { flex: none; width: 4rem; height: 4rem;
          display: flex; align-items: center; justify-content: center;
          border: 1px solid var(--color-border); border-radius: var(--radius-sm);
          background: var(--color-surface); }
        .hud-right { display: flex; flex-direction: column; align-items: stretch; gap: var(--space-3); }
        .hud-next { display: flex; flex-direction: column; gap: var(--space-2); }
        .hud-next .hud-box { width: 3.5rem; height: 3.5rem; }
        .hud-counters { display: flex; flex-direction: column; gap: var(--space-2); }
        .hud-counter { display: flex; flex-direction: column; align-items: center;
          font-weight: 600; line-height: 1.2; }
        .hud-counter-label { font-size: var(--text-sm); color: var(--color-text-muted); }
        .hud-counter-value { font-size: var(--text-lg); font-variant-numeric: tabular-nums; }
        @media (max-width: 48rem) { .game-hud { gap: var(--space-2); } }
      `}</style>
    </div>
  );
}
