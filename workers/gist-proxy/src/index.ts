// @tetorial/gist-proxy — GIST_PAT를 보유한 유일한 지점. 검증 후 Gist API를 프록시한다 (명세 §2·§7).
// 프레임워크 없이 plain fetch handler(라우트 4개). 런타임 의존성: @tetorial/types(zod)만.
import { ApiError } from "./errors.js";
import type { Env } from "./env.js";
import { assertOriginAllowed, corsHeaders, handlePreflight } from "./cors.js";
import { GitHubClient } from "./github.js";
import { handleCreate } from "./handlers/create.js";
import { handleNotes } from "./handlers/notes.js";
import { handleRead } from "./handlers/read.js";

export type { Env } from "./env.js";

/** origin CORS 헤더를 병합한 새 응답 (성공·오류 모두 통과). 캐시에는 CORS 미포함본이 저장된다. */
function withCors(response: Response, origin: string | null, env: Env): Response {
  const headers = new Headers(response.headers);
  for (const [k, v] of Object.entries(corsHeaders(origin, env))) headers.set(k, v);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

/** 본문·키·토큰은 절대 로깅하지 않는다 (§7, W-6). 한 줄 구조화 로그. */
function log(fields: {
  path: string;
  method: string;
  status: number;
  code?: string;
  gistId?: string;
  ms: number;
}): void {
  console.log(JSON.stringify({ svc: "gist-proxy", ...fields }));
}

async function route(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
  github: GitHubClient,
): Promise<Response> {
  const url = new URL(request.url);
  const segments = url.pathname.split("/").filter((s) => s.length > 0);

  // healthz — origin 무관, 배포 검증용 (§2)
  if (url.pathname === "/healthz") {
    if (request.method !== "GET") throw new ApiError("method-not-allowed");
    return Response.json({ ok: true, service: "gist-proxy" });
  }

  if (request.method === "OPTIONS") return handlePreflight(request, env);

  // /g 계열은 origin 게이트 통과 필요
  assertOriginAllowed(request, env);

  if (segments[0] === "g") {
    if (segments.length === 1) {
      if (request.method === "POST") return handleCreate(request, env, github);
      throw new ApiError("method-not-allowed");
    }
    if (segments.length === 2) {
      const gistId = segments[1]!;
      if (request.method === "GET") return handleRead(request, env, github, ctx, gistId);
      throw new ApiError("method-not-allowed");
    }
    if (segments.length === 3 && segments[2] === "notes") {
      const gistId = segments[1]!;
      if (request.method === "PUT") return handleNotes(request, env, github, gistId);
      throw new ApiError("method-not-allowed");
    }
  }
  throw new ApiError("not-found");
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const start = Date.now();
    const url = new URL(request.url);
    const origin = request.headers.get("Origin");
    const github = new GitHubClient(env.GIST_PAT);
    let response: Response;
    let code: string | undefined;

    try {
      response = await route(request, env, ctx, github);
    } catch (err) {
      if (err instanceof ApiError) {
        code = err.code;
        response = err.toResponse();
      } else {
        // 예상 외 내부 오류: 상세를 노출하지 않는다(시크릿 유출 방지). 고정 메시지만.
        code = "internal-error";
        response = Response.json({ code, message: "서버 오류가 발생했습니다." }, { status: 500 });
      }
    }

    log({
      path: url.pathname,
      method: request.method,
      status: response.status,
      code,
      gistId: url.pathname.split("/")[2],
      ms: Date.now() - start,
    });
    return withCors(response, origin, env);
  },
} satisfies ExportedHandler<Env>;
