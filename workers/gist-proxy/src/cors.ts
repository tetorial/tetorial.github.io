// CORS 처리 (명세 §5-1). 주의: 브라우저는 우회 가능하므로 이것은 보안 장치가 아니라
// "서비스 외 origin의 브라우저 호출을 걸러내는 잡음 감소 수단"이다. 실제 방어는
// rate limiting(인프라)·크기 게이트·무결성 검증·편집 키에 있다.
import { ApiError } from "./errors.js";
import type { Env } from "./env.js";

const ALLOW_METHODS = "GET, POST, PUT, OPTIONS";
const ALLOW_HEADERS = "Content-Type";

function allowlist(env: Env): string[] {
  return env.ALLOWED_ORIGINS.split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/** origin 헤더가 있고 허용 목록에 없으면 true (차단 대상). 헤더가 없으면(서버 간·healthz) 허용. */
function isForbiddenOrigin(origin: string | null, env: Env): boolean {
  if (origin === null) return false;
  return !allowlist(env).includes(origin);
}

/** 허용된 요청에 붙일 CORS 헤더. origin 헤더가 없으면 빈 객체. */
export function corsHeaders(origin: string | null, env: Env): Record<string, string> {
  if (origin === null || !allowlist(env).includes(origin)) return {};
  return {
    "Access-Control-Allow-Origin": origin,
    Vary: "Origin",
  };
}

/** preflight(OPTIONS) 처리. 비허용 origin은 403. */
export function handlePreflight(request: Request, env: Env): Response {
  const origin = request.headers.get("Origin");
  if (isForbiddenOrigin(origin, env)) {
    throw new ApiError("origin-forbidden");
  }
  return new Response(null, {
    status: 204,
    headers: {
      ...corsHeaders(origin, env),
      "Access-Control-Allow-Methods": ALLOW_METHODS,
      "Access-Control-Allow-Headers": ALLOW_HEADERS,
      "Access-Control-Max-Age": "86400",
    },
  });
}

/** 실제 요청의 origin 게이트. 비허용이면 throw. */
export function assertOriginAllowed(request: Request, env: Env): void {
  if (isForbiddenOrigin(request.headers.get("Origin"), env)) {
    throw new ApiError("origin-forbidden");
  }
}
