// 압축 유틸 — pako 래퍼(gzip/gunzip + base64). DecompressionStream 미사용으로 통일
// (브라우저 편차 회피 — apps-web §4). 저장 본문 인코딩은 "gzip+base64"(meta 스키마 고정).
import { gzip, ungzip } from "pako";

/** UTF-8 문자열 → gzip → base64 문자열. POST /g·PUT의 replayBody/파일 본문 인코딩. */
export function gzipBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  const gz = gzip(bytes);
  return bytesToBase64(gz);
}

/** base64(gzip) 문자열 → 원문 UTF-8 문자열. gunzip 실패 시 throw(무결성 분기 근거). */
export function gunzipBase64(b64: string): string {
  const gz = base64ToBytes(b64);
  const bytes = ungzip(gz); // 손상 시 예외
  return new TextDecoder().decode(bytes);
}

/** base64 인코딩 — btoa는 Latin-1만 받으므로 바이트를 안전하게 통과시킨다. */
export function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000; // 큰 배열의 스택 초과 회피
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

/** base64 디코딩 → 바이트. */
export function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
