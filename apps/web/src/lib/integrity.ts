// 무결성 검증 유틸 — SHA-256(소문자 hex). Web 표준 crypto.subtle 사용(meta.replay.sha256 대조).
// 저장 대상 원문(발췌 후·압축 전)의 해시를 계산한다(meta 스키마 §3, apps-web §3-B).

/** UTF-8 문자열의 SHA-256 hex(소문자 64자). */
export async function sha256Hex(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return bufferToHex(digest);
}

/** 발췌 원문 텍스트의 sha256·bytes를 함께 계산(meta.replay 조립용). */
export async function replayIntegrity(excerptJson: string): Promise<{ sha256: string; bytes: number }> {
  const bytes = new TextEncoder().encode(excerptJson);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return { sha256: bufferToHex(digest), bytes: bytes.length };
}

function bufferToHex(buffer: ArrayBuffer): string {
  const view = new Uint8Array(buffer);
  let hex = "";
  for (const b of view) hex += b.toString(16).padStart(2, "0");
  return hex;
}
