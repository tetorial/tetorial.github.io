// 수용 기준 커버리지 대조 — 작업 브랜치의 docs/specs/**/*.md에서 수용 기준 ID를 수집해
// 테스트 이름에 존재하는지 검사한다. 게이트 체크리스트 9항 및 CI에서 사용. 누락이 있으면 exit 1.
//
// 사용: node tools/check-acceptance.mjs
//
// 규칙 (WORKFLOW §4 — 명세는 main에 없고 작업 브랜치에만 산다):
// - docs/specs가 없으면(=main) 검사 대상 없음으로 통과한다.
// - 명세의 수용 기준 불릿 `- **<ID> <이름>**: ...` (부록 A 골격)에서 ID를 수집한다.
//   ID 형태: 접두(영문)+`-`+숫자 — 예: E-1, AW-10, M2B-1. 본문 인용(**D-20** 등)은 불릿
//   선두가 아니므로 수집되지 않는다.
// - 불릿에 `[문서]` 마커가 있으면 문서 전용 기준 — 테스트 대응을 요구하지 않는다.
// - 테스트 코퍼스: packages/*/src · workers/*/src · apps/*/src · tools/infra의
//   *.test.ts(x) 전체. ID가 따옴표 안 이름("M2B-1 ...")으로 등장해야 한다.

import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const DEFAULT_ROOT = fileURLToPath(new URL("..", import.meta.url));

/** 수용 기준 불릿 한 줄에서 ID·마커를 뽑는다. 골격: `- **<ID> <이름>**: <검증 내용>` */
const CRITERION_LINE = /^\s*-\s+\*\*([A-Za-z][A-Za-z0-9]*-\d+)\b[^\n]*$/;
const DOC_ONLY_MARKER = "[문서]";

function walk(dir, match, out = []) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return out; // 디렉터리 부재 = 대상 없음
  }
  for (const name of entries) {
    if (name === "node_modules") continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, match, out);
    else if (match(name)) out.push(p);
  }
  return out;
}

/** docs/specs 아래의 명세 파일 전부 (재귀). */
export function collectSpecFiles(root = DEFAULT_ROOT) {
  return walk(join(root, "docs", "specs"), (n) => n.endsWith(".md"));
}

/** 명세 본문에서 수용 기준 목록 추출 → [{ id, docOnly }] (등장 순, 중복 제거) */
export function extractCriteria(mdText) {
  const seen = new Map();
  for (const line of mdText.split("\n")) {
    const m = CRITERION_LINE.exec(line);
    if (m && !seen.has(m[1])) seen.set(m[1], { id: m[1], docOnly: line.includes(DOC_ONLY_MARKER) });
  }
  return [...seen.values()];
}

/** 수용 기준 ID를 테스트 이름으로 인용하는지 검사할 코퍼스 파일 목록. */
export function collectTestFiles(root = DEFAULT_ROOT) {
  const isTest = (n) => n.endsWith(".test.ts") || n.endsWith(".test.tsx");
  const out = [];
  for (const group of ["packages", "workers", "apps"]) {
    const groupDir = join(root, group);
    let entries;
    try {
      entries = readdirSync(groupDir);
    } catch {
      continue;
    }
    for (const pkg of entries) walk(join(groupDir, pkg, "src"), isTest, out);
  }
  walk(join(root, "tools", "infra"), isTest, out);
  return out;
}

/**
 * 대조 실행. 반환: { skipped } 또는 { specCount, criteria: [{id, docOnly, covered}], missing }
 */
export function checkAcceptance(root = DEFAULT_ROOT) {
  if (!existsSync(join(root, "docs", "specs"))) return { skipped: true };

  const specFiles = collectSpecFiles(root);
  const criteria = [];
  const seen = new Set();
  for (const f of specFiles) {
    for (const c of extractCriteria(readFileSync(f, "utf8"))) {
      if (!seen.has(c.id)) {
        seen.add(c.id);
        criteria.push(c);
      }
    }
  }

  const corpus = collectTestFiles(root)
    .map((f) => readFileSync(f, "utf8"))
    .join("\n");
  for (const c of criteria) {
    c.covered = c.docOnly || new RegExp(`["'\`]${c.id}[\\s"'\`]`).test(corpus);
  }
  return {
    skipped: false,
    specCount: specFiles.length,
    criteria,
    missing: criteria.filter((c) => !c.covered).map((c) => c.id),
  };
}

function main() {
  const res = checkAcceptance();
  if (res.skipped) {
    console.log("docs/specs 없음 — 검사 대상 없음. skip.");
    return 0;
  }
  if (res.specCount === 0 || res.criteria.length === 0) {
    console.log(
      "✗ docs/specs는 있으나 수용 기준 불릿(`- **<ID> ...**`)을 찾지 못함 — 골격(부록 A) 확인.",
    );
    return 1;
  }
  const docOnly = res.criteria.filter((c) => c.docOnly).map((c) => c.id);
  const tested = res.criteria.filter((c) => !c.docOnly && c.covered).map((c) => c.id);
  if (tested.length > 0) console.log(`✓ 테스트 대응: ${tested.join(" ")}`);
  if (docOnly.length > 0) console.log(`- 문서 전용(테스트 면제): ${docOnly.join(" ")}`);
  if (res.missing.length > 0) {
    console.log(`✗ 테스트 이름에 없는 수용 기준 — ${res.missing.join(", ")}`);
    return 1;
  }
  return 0;
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  process.exit(main());
}
