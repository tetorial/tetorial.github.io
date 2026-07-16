// GistIndex — 읽기 응답(§3) 및 쓰기 응답에 동봉되는 파일 목록. 본문은 포함하지 않는다.
import type { GistApiResponse } from "./github.js";

export interface GistIndex {
  gistId: string;
  files: { name: string; size: number; rawUrl: string; truncated: boolean }[];
  fetchedAt: string; // Worker가 GitHub에서 읽은 시각 (캐시 신선도 표시용)
}

/** 서비스가 생성한 gist임을 나타내는 description 프리픽스 (meta §4). */
export const SERVICE_PREFIX = "[tetorial]";

/** 서비스 규약 gist인지 — 아니면 호출부가 404로 위장 (§3, 서비스 외 gist 탐색 차단). */
export function isServiceGist(gist: GistApiResponse): boolean {
  return (gist.description ?? "").startsWith(SERVICE_PREFIX);
}

/** GitHub gist 응답 → GistIndex. raw_url은 리비전 고정 URL을 그대로 전달 (§3). */
export function toGistIndex(gist: GistApiResponse): GistIndex {
  return {
    gistId: gist.id,
    files: Object.values(gist.files).map((f) => ({
      name: f.filename,
      size: f.size,
      rawUrl: f.raw_url,
      truncated: f.truncated,
    })),
    fetchedAt: new Date().toISOString(),
  };
}
