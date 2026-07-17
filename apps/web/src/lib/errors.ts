// 오류·빈 상태 문구 매핑 (apps-web §6 표). Worker의 message(한국어)를 기본 표시하되
// 상황별 행동(홈 링크·재시도)을 덧붙인다. AW-9가 표 전 행의 분기를 검증한다.

/** 오류 후속 행동 — UI가 홈 링크/재시도 버튼을 어떻게 붙일지 결정한다. */
export type ErrorAction =
  | { kind: "home" } // 홈으로 돌아가기 링크
  | { kind: "retry"; retryAfterMs: number | null } // 잠시 후 재시도(Retry-After 반영)
  | { kind: "none" };

export interface DisplayError {
  title: string;
  /** 초과 항목 등 부가 설명(선택). */
  detailText?: string;
  action: ErrorAction;
}

/** Worker 오류 응답 본문(gist-proxy §6). */
export interface WorkerErrorBody {
  code: string;
  message?: string;
  detail?: unknown;
}

/** 클라이언트/Worker 오류 상황의 정규화 입력. */
export type ErrorInput =
  | { source: "worker"; status: number; body: WorkerErrorBody; retryAfterMs?: number | null }
  | { source: "integrity" } // sha256 불일치 / gunzip 실패 (클라이언트 검출)
  | { source: "playback" } // 재생 엔진 오류(버전 초과 추정 — replay §7)
  | { source: "network" } // fetch 실패(오프라인 등)
  | { source: "worker-unconfigured" }; // 읽기 경로: Worker URL 미설정(getWorkerClient 실패 — AW-21)

// §6 표의 고정 문구.
const TXT = {
  notFound: "리플레이를 찾을 수 없습니다",
  corrupt: "파일이 손상되었거나 형식이 다릅니다",
  playback: "지원: TETR.IO ≤ 1.7.8 (triangle v4.2.7)",
  editKeyMismatch: "이 노트의 편집 키가 이 브라우저에 없거나 일치하지 않습니다",
  limitExceeded: "업로드 한도를 초과했습니다",
  retry: "잠시 후 다시 시도해 주세요",
  writesDisabled: "저장 기능이 일시 중지되었습니다",
  workerUnconfigured: "리플레이 조회 서비스가 설정되지 않았습니다",
  originForbidden: "이 출처에서는 요청이 허용되지 않습니다",
  badRequest: "요청 형식이 올바르지 않습니다",
  upstream: "저장소 연결에 문제가 발생했습니다",
  network: "네트워크에 연결할 수 없습니다",
  unknown: "알 수 없는 오류가 발생했습니다",
} as const;

/** limit-exceeded의 detail(sim §4 공급)을 사람이 읽는 초과 항목 문자열로 요약한다. */
export function summarizeLimitDetail(detail: unknown): string | undefined {
  if (!Array.isArray(detail)) return undefined;
  const parts: string[] = [];
  for (const v of detail) {
    if (v && typeof v === "object" && "message" in v && typeof v.message === "string") {
      parts.push(v.message);
    }
  }
  return parts.length > 0 ? parts.join("; ") : undefined;
}

/** 정규화 입력 → 표시 오류(문구 + 후속 행동). */
export function toDisplayError(input: ErrorInput): DisplayError {
  switch (input.source) {
    case "integrity":
      return { title: TXT.corrupt, action: { kind: "none" } };
    case "playback":
      return { title: TXT.playback, action: { kind: "none" } };
    case "network":
      return { title: TXT.network, action: { kind: "retry", retryAfterMs: null } };
    case "worker-unconfigured":
      return { title: TXT.workerUnconfigured, action: { kind: "none" } };
    case "worker":
      return mapWorkerError(input);
  }
}

function mapWorkerError(input: {
  status: number;
  body: WorkerErrorBody;
  retryAfterMs?: number | null;
}): DisplayError {
  const { status, body } = input;
  const msg = body.message; // Worker의 한국어 message 우선
  const retryAfterMs = input.retryAfterMs ?? null;

  switch (body.code) {
    case "not-found":
      return { title: msg ?? TXT.notFound, action: { kind: "home" } };
    case "integrity-mismatch":
      return { title: msg ?? TXT.corrupt, action: { kind: "none" } };
    case "edit-key-mismatch":
      return { title: msg ?? TXT.editKeyMismatch, action: { kind: "none" } };
    case "origin-forbidden":
      return { title: msg ?? TXT.originForbidden, action: { kind: "none" } };
    case "limit-exceeded":
      return {
        title: msg ?? TXT.limitExceeded,
        detailText: summarizeLimitDetail(body.detail),
        action: { kind: "none" },
      };
    case "payload-too-large":
      return {
        title: msg ?? TXT.limitExceeded,
        detailText: summarizeLimitDetail(body.detail),
        action: { kind: "none" },
      };
    case "rate-limited":
      return { title: msg ?? TXT.retry, action: { kind: "retry", retryAfterMs } };
    case "writes-disabled":
      return { title: msg ?? TXT.writesDisabled, action: { kind: "none" } };
    case "upstream-rate-limited":
      return { title: msg ?? TXT.retry, action: { kind: "retry", retryAfterMs } };
    case "upstream-error":
      return { title: msg ?? TXT.upstream, action: { kind: "retry", retryAfterMs: null } };
    case "bad-request":
      return { title: msg ?? TXT.badRequest, action: { kind: "none" } };
    case "method-not-allowed":
      return { title: msg ?? TXT.badRequest, action: { kind: "none" } };
  }

  // code 미매칭 시 상태 코드로 폴백(표의 상황별 행동 유지).
  if (status === 404) return { title: msg ?? TXT.notFound, action: { kind: "home" } };
  if (status === 413 || status === 422) {
    return {
      title: msg ?? TXT.limitExceeded,
      detailText: summarizeLimitDetail(body.detail),
      action: { kind: "none" },
    };
  }
  if (status === 429 || status === 503) {
    return { title: msg ?? TXT.retry, action: { kind: "retry", retryAfterMs } };
  }
  if (status >= 500) return { title: msg ?? TXT.upstream, action: { kind: "retry", retryAfterMs: null } };
  return { title: msg ?? TXT.unknown, action: { kind: "none" } };
}

/** Retry-After 헤더(초 또는 HTTP-date) → ms. 파싱 불가 시 null. */
export function parseRetryAfter(header: string | null, nowMs: number = Date.now()): number | null {
  if (header === null || header === "") return null;
  const seconds = Number(header);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const date = Date.parse(header);
  if (!Number.isNaN(date)) return Math.max(0, date - nowMs);
  return null;
}
