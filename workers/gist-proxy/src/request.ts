// 요청 본문 읽기 — Content-Length 게이트 + 파싱 후 실측 재검증(헤더 위조 대비, §5-2).
import { ApiError } from "./errors.js";
import { byteLength } from "./hash.js";

/** 크기 상한을 강제하며 JSON 본문을 읽는다. 초과 413, 파싱 실패 400. */
export async function readJsonBody(request: Request, maxBytes: number): Promise<unknown> {
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) {
    throw new ApiError("payload-too-large");
  }
  const text = await request.text();
  if (byteLength(text) > maxBytes) {
    throw new ApiError("payload-too-large"); // 헤더가 작게 위조돼도 실측에서 차단
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ApiError("bad-request", { message: "본문이 유효한 JSON이 아닙니다." });
  }
}
