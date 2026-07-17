// gist 입력(공유 링크·gist URL·순수 id) 해석 → 이동 URL / 오류 문구 분기 (AW-20, #43).
// 홈(OpenIsland)과 리플레이 EmptyState가 이 헬퍼를 공유한다 — 문구·의미론이 갈라지면 안 된다
// (#43은 링크 공유 개시와 직결. D-20 따름정리).
import { buildDeepLink } from "./deeplink.js";
import { extractGistId } from "./handoff.js";

/** 형식 오류 문구 — 홈과 리플레이 페이지가 동일 문자열을 표시한다. */
export const GIST_INPUT_ERROR = "공유 링크 또는 gist ID 형식이 올바르지 않습니다.";

/** 입력란 placeholder — 양쪽 통일. */
export const GIST_INPUT_PLACEHOLDER = "공유 링크 또는 gist ID";

/** 해석 결과 — 이동 URL 또는 인라인 오류 문구의 두 갈래만 있다. */
export type GistInputResult =
  | { ok: true; url: string } // 경로형 정규형 이동 URL(M1d-1 발신 규약)
  | { ok: false; message: string };

/** 입력 원문을 해석해 정규형 이동 URL 또는 오류 문구를 반환한다. */
export function resolveGistInput(input: string): GistInputResult {
  const id = extractGistId(input);
  if (id === null) return { ok: false, message: GIST_INPUT_ERROR };
  return { ok: true, url: buildDeepLink({ gistId: id }) };
}
