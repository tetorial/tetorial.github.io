// Worker 바인딩 (conventions §7). 시크릿은 wrangler secret, vars는 wrangler.toml/[vars].
export interface Env {
  /** 시크릿: Gist 전용 부계정 fine-grained PAT (gist 스코프). 어떤 응답·로그에도 노출 금지. */
  GIST_PAT: string;
  /** 시크릿(선택): 설정 시에만 Turnstile 검증 활성 (§5-4). */
  TURNSTILE_SECRET?: string;
  /** var: 부계정 사용자명. description 검증·로그용. */
  GIST_OWNER: string;
  /** var: CORS 허용 origin 목록 (쉼표 구분). */
  ALLOWED_ORIGINS: string;
  /** var: "false"면 전체 쓰기 차단 (비상 스위치 §1). 미설정/그 외 = 활성. */
  WRITE_ENABLED?: string;
}

/** 쓰기 활성 여부 — 명시적 "false"일 때만 차단, 기본 활성 (§1 비상 스위치 의미론). */
export function writesEnabled(env: Env): boolean {
  return env.WRITE_ENABLED !== "false";
}
