// 결정론적 id 생성 — sim은 Math.random·Date 금지(CLAUDE.md 결정론 규칙)이므로
// 순수 해시(cyrb53, Math.imul 기반)로 id를 파생한다.
// note id는 M1b부터 외부 주입(authoring.ts) — 여기서는 page id만 파생한다.

// [A-Za-z0-9_-] 64자 — notes 스키마의 id 문자집합과 정확히 일치 (6비트/문자)
const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

/**
 * cyrb53 (public domain) — 53비트 결정론 해시. `Math.imul`만 사용(랜덤·시각 미접촉).
 * 출처: https://stackoverflow.com/a/52171480 (bryc, CC0)
 */
function cyrb53(str: string): number {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}

/** 53비트 정수를 [A-Za-z0-9_-] 8자(48비트)로 인코딩 */
function encode8(n: number): string {
  let v = n;
  let out = "";
  for (let i = 0; i < 8; i++) {
    out += ALPHABET[v % 64];
    v = Math.floor(v / 64);
  }
  return out;
}

/** page.id — noteId + 단조 카운터 해시. 노트 내 유일(카운터 단조 증가) */
export function makePageId(noteId: string, counter: number): string {
  return encode8(cyrb53("page\0" + noteId + "\0" + String(counter)));
}
