// 분기(시뮬레이터 진입) 바 (ReplayIsland 분해 — M4-C AW-23, #46).
export function BranchBar({
  onBranch,
  hasGist,
  limitReason,
  blockedReason,
}: {
  onBranch: () => void;
  hasGist: boolean;
  /** 노트 합산 한도 도달 시 차단 사유(M1d-6). null이면 정상 진입. */
  limitReason: string | null;
  /** captureBranch 실패 사유 인라인 안내(AW-22). null이면 표시 없음. */
  blockedReason: string | null;
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
      {blockedReason !== null && (
        <span class="hint limit" role="status" data-testid="branch-blocked">
          {blockedReason}
        </span>
      )}
      <style>{STYLES}</style>
    </div>
  );
}

const STYLES = `
  .branch-bar { display: flex; gap: var(--space-3); align-items: center; }
  .branch-bar .hint.limit { color: var(--color-warn); }
`;
