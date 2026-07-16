// 해시·인코딩 헬퍼 — Web 표준 API만 (crypto.subtle·DecompressionStream). Node 전용 API 금지 (§7).
import { ApiError } from "./errors.js";

/** 바이트열의 SHA-256을 소문자 hex 64자로. editKeyHash·replay 무결성 대조 규약과 일치. */
export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** UTF-8 문자열의 SHA-256 hex (editKey 해싱용). */
export function sha256HexOfString(text: string): Promise<string> {
  return sha256Hex(new TextEncoder().encode(text));
}

/** base64 → 바이트열. 형식 오류는 422 integrity-mismatch로 번역(무결성 검증 단계에서 호출되므로). */
export function base64Decode(b64: string): Uint8Array {
  let binary: string;
  try {
    binary = atob(b64);
  } catch {
    throw new ApiError("integrity-mismatch", { message: "replayBody가 유효한 base64가 아닙니다." });
  }
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

/** gzip 해제 (DecompressionStream). 손상 시 422 integrity-mismatch. */
export async function gunzip(bytes: Uint8Array): Promise<Uint8Array> {
  try {
    const stream = new Response(
      new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip")),
    );
    return new Uint8Array(await stream.arrayBuffer());
  } catch {
    throw new ApiError("integrity-mismatch", { message: "replayBody의 gzip 해제에 실패했습니다." });
  }
}

/** UTF-8 바이트 길이 (Content-Length 실측 재검증·직렬화 크기 검사용). */
export function byteLength(text: string): number {
  return new TextEncoder().encode(text).length;
}
