// 노트 id 생성 — sim은 CSPRNG 미접촉(결정론)이므로 id는 웹이 만들어 값으로 주입한다
// (sim-m1b §6). 규격은 @tetorial/types notes 스키마(idSchema): [A-Za-z0-9_-]{8}.
// M1d(딥링크·UX 개정)가 이 유틸을 재사용한다.

/** URL-safe 알파벳 64자 = 6비트/문자 — 바이트 % 64는 무편향 */
const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-";

/** 신규 노트 id 8자 생성 (crypto.getRandomValues — D-4의 CSPRNG 규칙과 동일 계열) */
export function generateNoteId(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  let out = "";
  for (const b of bytes) out += ALPHABET[b % 64];
  return out;
}
