// GET /g/:gistId — 파일 목록·raw URL 조회 (§3). 본문은 포함하지 않는다(클라이언트가 raw_url 병렬 fetch).
// 엣지 캐시: Cache API 60초 TTL, 키 = 요청 URL. 저장 직후 갱신은 쓰기 응답의 index 동봉으로 해소.
import { ApiError } from "../errors.js";
import type { Env } from "../env.js";
import { isServiceGist, toGistIndex } from "../gist-index.js";
import { GitHubClient } from "../github.js";

const CACHE_TTL_SECONDS = 60;

export async function handleRead(
  request: Request,
  env: Env,
  github: GitHubClient,
  ctx: ExecutionContext,
  gistId: string,
): Promise<Response> {
  const cache = caches.default;
  const cached = await cache.match(request);
  if (cached !== undefined) {
    // 캐시 히트 — GitHub 호출 없음 (§1 예산: 목록 조회를 엣지 캐시로 흡수)
    const headers = new Headers(cached.headers);
    headers.set("X-Cache", "HIT");
    return new Response(cached.body, {
      status: cached.status,
      statusText: cached.statusText,
      headers,
    });
  }

  const gist = await github.getGist(gistId);
  // 존재하지 않거나 서비스 규약 외 gist → 404 위장 (서비스 외 gist 탐색 차단)
  if (gist === null || !isServiceGist(gist)) throw new ApiError("not-found");

  const response = Response.json(toGistIndex(gist), {
    headers: {
      "Cache-Control": `public, max-age=${CACHE_TTL_SECONDS}`,
      "X-Cache": "MISS",
    },
  });
  // 캐시에 저장(CORS 헤더 미포함 상태 — origin 비의존). 응답 반환은 지연 없이.
  ctx.waitUntil(cache.put(request, response.clone()));
  return response;
}
