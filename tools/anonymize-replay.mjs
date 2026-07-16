// tetr.io 리플레이(ttrm/ttr) 익명화 도구 — fixture 공개 커밋용 (decisions D-16)
// 사용: node tools/anonymize-replay.mjs <입력> <출력>
//
// 치환 규칙 (원문 텍스트 수준 치환 — 그 외 바이트는 보존):
//   1. 최상위 users[]의 username → 등장 순서대로 "anon-p1", "anon-p2", ... (파일 전체 전 등장 위치)
//   2. 최상위 users[]의 id(24자 hex) → "0...01", "0...02" (24자 유지, 파일 전체)
//   3. 최상위 id(리플레이 ID, 존재 시) → 같은 길이의 "0" 문자열
//   4. users[].country → null
// 치환 후 JSON 재파싱으로 구조 무결성을 검증하고, 원본 토큰 잔존 시 실패한다.

import { readFileSync, writeFileSync } from "node:fs";

const [, , inPath, outPath] = process.argv;
if (!inPath || !outPath) {
  console.error("사용법: node tools/anonymize-replay.mjs <입력> <출력>");
  process.exit(1);
}

const raw = readFileSync(inPath, "utf8");
const doc = JSON.parse(raw);
if (!Array.isArray(doc.users)) throw new Error("users 배열이 없다 — ttrm/ttr 파일이 맞는지 확인");

/** 전 등장 위치를 안전하게 치환 (JSON 문자열 값으로만 등장한다고 가정, 따옴표 포함 대조) */
function replaceAllQuoted(text, from, to) {
  return text.split(`"${from}"`).join(`"${to}"`);
}

let out = raw;
const secrets = [];

doc.users.forEach((u, i) => {
  if (typeof u.username === "string" && u.username.length > 0) {
    out = replaceAllQuoted(out, u.username, `anon-p${i + 1}`);
    secrets.push(u.username);
  }
  if (typeof u.id === "string" && u.id.length > 0) {
    out = replaceAllQuoted(out, u.id, String(i + 1).padStart(u.id.length, "0"));
    secrets.push(u.id);
  }
  if (typeof u.country === "string") {
    out = out.replace(`"country":${JSON.stringify(u.country)}`, '"country":null');
  }
});

if (typeof doc.id === "string" && doc.id.length > 0) {
  out = replaceAllQuoted(out, doc.id, "0".repeat(doc.id.length));
  secrets.push(doc.id);
}

// 검증 1: 여전히 유효한 JSON이고 구조 키가 보존되는가
const reparsed = JSON.parse(out);
for (const key of Object.keys(doc)) {
  if (!(key in reparsed)) throw new Error(`치환이 구조를 파괴했다: 키 ${key} 소실`);
}
// 검증 2: 원본 식별 토큰이 잔존하지 않는가
for (const s of secrets) {
  if (out.includes(s)) throw new Error(`원본 토큰 잔존: ${s.slice(0, 4)}…`);
}

writeFileSync(outPath, out);
console.log(
  `${inPath} → ${outPath}: users ${doc.users.length}명 익명화, 토큰 ${secrets.length}개 치환 완료`,
);
