// 리플레이 빈 상태·오류 상태 화면 (ReplayIsland 분해 — M4-C AW-23, #46).
// 주의: `.empty`·`.error-state` 등의 규칙은 ReplayIsland STYLES에 있으나 이 화면들은 loaded 분기
// 밖이라 현행에서도 적용되지 않는다 — 동작 불변을 위해 스타일을 동반 이동하지 않는다(QUESTIONS.md Q2).
import { useState } from "preact/hooks";
import { withBase } from "../../lib/base-url.ts";
import { resolveGistInput, GIST_INPUT_PLACEHOLDER } from "../../lib/gist-input.ts";
import type { DisplayError } from "../../lib/errors.ts";

export function EmptyState({ onLocalText }: { onLocalText: (text: string) => void }) {
  const [gist, setGist] = useState("");
  const [gistError, setGistError] = useState<string | null>(null);
  // 홈(OpenIsland)과 동일 의미론(AW-20) — 해석 후 경로형 정규형 URL로 이동해야
  // 새로고침 시에도 유실되지 않는다(M1d-1 발신 규약).
  const openGist = (): void => {
    const res = resolveGistInput(gist);
    if (!res.ok) {
      setGistError(res.message);
      return;
    }
    window.location.href = res.url;
  };
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
          placeholder={GIST_INPUT_PLACEHOLDER}
          value={gist}
          data-testid="empty-gist-input"
          onInput={(e) => setGist((e.target as HTMLInputElement).value)}
        />
        <button class="btn" onClick={openGist} data-testid="empty-gist-open">
          공유 링크 열기
        </button>
      </div>
      {gistError && (
        <p class="error-detail" role="alert" data-testid="empty-gist-error">
          {gistError}
        </p>
      )}
      <p><a href={withBase("/")}>← 홈으로</a></p>
    </div>
  );
}

export function ErrorState({ error, onRetry }: { error: DisplayError; onRetry: () => void }) {
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
