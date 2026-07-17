// 라운드·플레이어 선택 + 지원 배지 (ReplayIsland 분해 — M4-C AW-23, #46).
// 라운드 표시 번호는 originalRound 헬퍼 한 경로만 쓴다(AW-25, #47).
import { originalRound, type LoadedReplay } from "../../lib/open-replay.ts";
import type { supportReport } from "@tetorial/replay-tetrio";

export function RoundPlayerSelect({
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
              <option value={i}>R{originalRound(roundMap, i) + 1}</option>
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
      <style>{STYLES}</style>
    </div>
  );
}

/** 지원 배지 — 조건부로 null을 반환하므로 스타일은 ReplayIsland STYLES에 잔류(m4c §3 함정 주의). */
export function SupportBadge({ support }: { support: ReturnType<typeof supportReport> }) {
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

const STYLES = `
  .rp-select { display: flex; gap: var(--space-3); }
  .rp-select label { display: flex; gap: var(--space-1); align-items: center; }
`;
