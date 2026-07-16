// 오류 응답 규약 (명세 §6). 형식: { code, message, detail? } · message는 한국어(UI 직접 표시 가능).
// 업스트림(GitHub) 본문을 그대로 중계하지 않고 코드로 번역한다 (§5-6, W-5).

export type ErrorCode =
  | "bad-request"
  | "edit-key-mismatch"
  | "origin-forbidden"
  | "not-found"
  | "method-not-allowed"
  | "payload-too-large"
  | "integrity-mismatch"
  | "limit-exceeded"
  | "rate-limited"
  | "upstream-error"
  | "writes-disabled"
  | "upstream-rate-limited";

/** 코드 → 기본 HTTP 상태·한국어 메시지 (UI 표시용). */
const DEFAULTS: Record<ErrorCode, { status: number; message: string }> = {
  "bad-request": { status: 400, message: "요청 형식이 올바르지 않습니다." },
  "edit-key-mismatch": {
    status: 403,
    message: "편집 키가 일치하지 않아 이 노트를 수정할 수 없습니다.",
  },
  "origin-forbidden": { status: 403, message: "허용되지 않은 출처입니다." },
  "not-found": { status: 404, message: "대상을 찾을 수 없습니다." },
  "method-not-allowed": { status: 405, message: "허용되지 않은 메서드입니다." },
  "payload-too-large": { status: 413, message: "요청 크기가 상한을 초과했습니다." },
  "integrity-mismatch": { status: 422, message: "무결성 검증에 실패했습니다(해시·바이트 불일치)." },
  "limit-exceeded": { status: 422, message: "스키마 한도를 초과했습니다." },
  "rate-limited": { status: 429, message: "요청이 너무 많습니다. 잠시 후 다시 시도하세요." },
  "upstream-error": { status: 502, message: "저장소 서버 오류로 처리하지 못했습니다." },
  "writes-disabled": { status: 503, message: "현재 쓰기가 일시 중단되었습니다." },
  "upstream-rate-limited": {
    status: 503,
    message: "저장소 쿼터가 소진되었습니다. 잠시 후 다시 시도하세요.",
  },
};

/** 오류 응답을 던지기 위한 예외 — 핸들러 어디서든 throw하면 라우터가 JSON 응답으로 변환한다. */
export class ApiError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly detail?: unknown;
  readonly headers?: Record<string, string>;

  constructor(
    code: ErrorCode,
    opts: {
      status?: number;
      message?: string;
      detail?: unknown;
      headers?: Record<string, string>;
    } = {},
  ) {
    const def = DEFAULTS[code];
    super(opts.message ?? def.message);
    this.code = code;
    this.status = opts.status ?? def.status;
    this.detail = opts.detail;
    this.headers = opts.headers;
  }

  toResponse(): Response {
    const body: { code: ErrorCode; message: string; detail?: unknown } = {
      code: this.code,
      message: this.message,
    };
    if (this.detail !== undefined) body.detail = this.detail;
    return Response.json(body, { status: this.status, headers: this.headers });
  }
}
