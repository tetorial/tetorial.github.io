// zod 검증 실패를 오류 응답으로 번역 (§4-1·§4-2).
// 규칙: 스키마 §6 "한도 초과"는 422 limit-exceeded, 그 밖의 구조·타입·산술 경계 위반은 400 bad-request.
//   한도의 두 형태: ① 개수·길이 캡(notes>50·pages>100·queue>1000·board>40행) → zod code "too_big".
//                   ② 코드포인트 캡(title·description·comment) → .refine 이므로 code "custom" (§6 명시 필드).
//   산술 경계(queueUsed≤queue·id 유일성·rounds 정렬·ttr 교차검증)도 custom이지만 위 필드가 아니므로 400.
//   (§4-2·W-2는 한도 위반을 "400 또는 422" 어느 쪽도 허용 — 여기선 422로 세분해 UI에 신호를 준다.)
// detail은 필드 경로·코드·메시지만 담는다(값 미포함 — 잠재적 민감정보 반입 방지, W-6).
// zod를 직접 import하지 않는다(§7: 런타임 의존성은 @tetorial/types만) — 구조적 타입으로 받는다.
import { ApiError } from "./errors.js";

/** §6에서 코드포인트 한도가 걸린 자유 텍스트 필드 — 이 필드의 custom refine 실패는 한도 초과다. */
const CODEPOINT_LIMIT_FIELDS = new Set(["title", "description", "comment"]);

function isLimitIssue(issue: { code: string; path: readonly PropertyKey[] }): boolean {
  if (issue.code === "too_big") return true; // 개수·길이 캡
  if (issue.code === "custom") {
    const leaf = issue.path[issue.path.length - 1];
    return typeof leaf === "string" && CODEPOINT_LIMIT_FIELDS.has(leaf);
  }
  return false;
}

interface ZodLikeIssue {
  path: readonly PropertyKey[];
  code: string;
  message: string;
}
/** zod의 SafeParseError.error 구조 부분집합 — ZodError가 구조적으로 대입 가능. */
export interface ZodLikeError {
  issues: readonly ZodLikeIssue[];
}

interface SafeIssue {
  path: (string | number)[];
  code: string;
  message: string;
}

function toSafeIssues(error: ZodLikeError): SafeIssue[] {
  return error.issues.map((i) => ({
    path: i.path.map((p) => (typeof p === "symbol" ? p.toString() : p)),
    code: i.code,
    message: i.message,
  }));
}

/** zod 실패 → ApiError. 한도 위반 이슈가 하나라도 있으면 limit-exceeded, 아니면 bad-request. */
export function zodError(error: ZodLikeError): ApiError {
  const detail = toSafeIssues(error);
  const isLimit = error.issues.some(isLimitIssue);
  return isLimit
    ? new ApiError("limit-exceeded", { detail })
    : new ApiError("bad-request", { detail });
}
