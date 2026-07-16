// GitHub Gist API 클라이언트 — PAT를 보유한 유일한 지점 (§1, D-3).
// 업스트림 오류는 코드로 번역하고 본문은 중계하지 않는다 (§5-6, W-5).
// PAT는 Authorization 헤더로만 나가며 어떤 로그·응답에도 남기지 않는다 (W-6).
import { ApiError } from "./errors.js";

const API_BASE = "https://api.github.com";

/** GitHub gist 응답 중 이 서비스가 사용하는 최소 형태. */
export interface GistFile {
  filename: string;
  size: number;
  raw_url: string;
  truncated: boolean;
  content?: string; // ≤1MB 파일은 인라인 제공 (truncated=false)
}
export interface GistApiResponse {
  id: string;
  description: string | null;
  files: Record<string, GistFile>;
}

/** 요청당 GitHub API 호출 수를 세는 클라이언트 (W-7 예산 검증의 근거). */
export class GitHubClient {
  callCount = 0;
  constructor(private readonly pat: string) {}

  private async call(path: string, init: RequestInit): Promise<Response> {
    this.callCount++;
    const res = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${this.pat}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "tetorial-gist-proxy",
        ...init.headers,
      },
    });
    return res;
  }

  /** 업스트림 상태를 서비스 오류로 번역. 404는 호출부가 개별 처리하도록 그대로 반환. */
  private translate(res: Response): never {
    // GitHub rate limit: 403/429 + x-ratelimit-remaining:0 또는 retry-after 존재 (1차·2차 한도).
    const remaining = res.headers.get("x-ratelimit-remaining");
    const retryAfter = res.headers.get("retry-after");
    const isRateLimit =
      (res.status === 403 || res.status === 429) && (remaining === "0" || retryAfter !== null);
    if (isRateLimit) {
      const headers: Record<string, string> = {};
      if (retryAfter !== null) headers["Retry-After"] = retryAfter;
      else {
        const reset = res.headers.get("x-ratelimit-reset");
        if (reset !== null) {
          const secs = Math.max(0, Math.ceil(Number(reset) - Date.now() / 1000));
          headers["Retry-After"] = String(secs);
        }
      }
      throw new ApiError("upstream-rate-limited", { headers });
    }
    // 5xx 및 그 밖의 예상 외 응답 → 502. 업스트림 본문은 읽지도 중계하지도 않는다.
    throw new ApiError("upstream-error");
  }

  async createGist(body: {
    public: boolean;
    description: string;
    files: Record<string, { content: string }>;
  }): Promise<GistApiResponse> {
    const res = await this.call("/gists", { method: "POST", body: JSON.stringify(body) });
    if (res.status === 201) return (await res.json()) as GistApiResponse;
    this.translate(res);
  }

  /** GET /gists/:id. 404면 null 반환(호출부가 not-found 위장 처리). */
  async getGist(id: string): Promise<GistApiResponse | null> {
    const res = await this.call(`/gists/${id}`, { method: "GET" });
    if (res.status === 200) return (await res.json()) as GistApiResponse;
    if (res.status === 404) return null;
    this.translate(res);
  }

  async patchGist(
    id: string,
    files: Record<string, { content: string }>,
  ): Promise<GistApiResponse> {
    const res = await this.call(`/gists/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ files }),
    });
    if (res.status === 200) return (await res.json()) as GistApiResponse;
    this.translate(res);
  }
}
