// 수용 기준 커버리지 대조 — docs/specs의 수용 기준 ID가 테스트 이름에 존재하는지 검사한다.
// 게이트 체크리스트(kickoff §3) 및 CI에서 사용. 누락이 있으면 exit 1.
//
// 사용: node tools/check-acceptance.mjs
//
// 규칙:
// - 명세의 "수용 기준" 절에서 `**<ID>` 패턴(예: **E-1, **AW-10)으로 ID를 수집한다.
// - 소스 트리(packages/*/src, workers/*/src, apps/*/src, tools/infra)의 *.test.ts에서
//   따옴표 안 ID 언급("E-1 ..." 등)을 수집해 대조한다.
// - 아직 구현 전 모듈(테스트 파일이 하나도 없는 패키지)의 ID는 "미착수"로 분류하고 실패로 치지 않는다.

import fs from "node:fs";

if (!fs.existsSync("docs/specs")) {
  console.log("docs/specs 없음 — 검사 대상 없음. skip.");
  process.exit(0);
}

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");

/** 명세별 ID 접두 → 담당 테스트 루트 디렉터리 */
const MODULES = [
  { spec: "docs/specs/engine.md", prefix: "E", dir: "packages/engine/src" },
  { spec: "docs/specs/adapter-tetrio.md", prefix: "A", dir: "packages/adapter-tetrio/src" },
  { spec: "docs/specs/gist-proxy.md", prefix: "W", dir: "workers/gist-proxy/src" },
  { spec: "docs/specs/renderer.md", prefix: "RD", dir: "packages/renderer/src" },
  { spec: "docs/specs/replay-tetrio.md", prefix: "RT", dir: "packages/replay-tetrio/src" },
  { spec: "docs/specs/input.md", prefix: "I", dir: "packages/input/src" },
  { spec: "docs/specs/sim.md", prefix: "S", dir: "packages/sim/src" },
  { spec: "docs/specs/apps-web.md", prefix: "AW", dir: "apps/web/src" },
];

function walk(dir, out = []) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return out; // 디렉터리 부재 = 미착수
  }
  for (const name of entries) {
    if (name === "node_modules") continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (name.endsWith(".test.ts")) out.push(p);
  }
  return out;
}

let failed = false;

for (const m of MODULES) {
  const specText = readFileSync(join(ROOT, m.spec), "utf8");
  // 수용 기준 ID: **E-1 형태 (굵게 시작). 중복 제거 후 숫자 정렬
  const idPattern = new RegExp(`\\*\\*(${m.prefix}-\\d+)\\b`, "g");
  const ids = [...new Set([...specText.matchAll(idPattern)].map((x) => x[1]))].sort(
    (a, b) => Number(a.split("-")[1]) - Number(b.split("-")[1]),
  );
  if (ids.length === 0) {
    console.log(`? ${m.spec}: 수용 기준 ID를 찾지 못함 (패턴 확인 필요)`);
    failed = true;
    continue;
  }

  const testFiles = walk(join(ROOT, m.dir));
  if (testFiles.length === 0) {
    console.log(`- ${m.dir}: 미착수 (테스트 없음) — ${ids.length}개 ID 대기`);
    continue;
  }

  const corpus = testFiles.map((f) => readFileSync(f, "utf8")).join("\n");
  const missing = ids.filter((id) => !new RegExp(`["'\`]${id}[\\s"'\`]`).test(corpus));
  if (missing.length > 0) {
    console.log(`✗ ${m.dir}: 테스트 이름에 없는 수용 기준 — ${missing.join(", ")}`);
    failed = true;
  } else {
    console.log(`✓ ${m.dir}: ${ids.join(" ")} (${testFiles.length}개 테스트 파일)`);
  }
}

process.exit(failed ? 1 : 0);
