// 라운드 선택 + 지원 배지 (구 RoundPlayerSelect — M6-B로 플레이어 셀렉터 제거).
// 1vs1은 두 플레이어 보드를 동시에 재생하므로 플레이어 셀렉터가 사라졌다(명세 §3, AW-37) —
// 라운드 선택만 남는다. 라운드 표시 번호는 originalRound 헬퍼 한 경로만 쓴다(AW-25, #47).
import { originalRound, type LoadedReplay } from "../../lib/open-replay.ts";
import type { supportReport } from "@tetorial/replay-tetrio";

export function RoundSelect({
  doc,
  roundMap,
  round,
  onChange,
}: {
  doc: LoadedReplay["doc"];
  roundMap: number[];
  round: number;
  onChange: (r: number) => void;
}) {
  if (doc.rounds.length <= 1) return null;
  return (
    <div class="rp-select">
      <label>
        라운드
        <select
          value={round}
          data-testid="round-select"
          onChange={(e) => onChange(Number((e.target as HTMLSelectElement).value))}
        >
          {doc.rounds.map((_, i) => (
            <option value={i}>R{originalRound(roundMap, i) + 1}</option>
          ))}
        </select>
      </label>
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
