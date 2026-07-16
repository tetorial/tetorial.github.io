// W0b-4 Workers 런타임 호환: 런타임 소스는 zod 외 의존 0, Node 내장 모듈 미사용
// (테스트 자체는 Node/Vitest에서 돌지만, 검사 대상은 배포되는 src 소스다)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const srcDir = path.dirname(fileURLToPath(import.meta.url));
const pkgDir = path.resolve(srcDir, "..");

/** src의 런타임 소스 파일(테스트 제외) 목록 */
function runtimeSources(): string[] {
  return fs
    .readdirSync(srcDir)
    .filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"))
    .map((f) => path.join(srcDir, f));
}

/** 파일의 정적 import 지정자 목록 (export ... from 포함) */
function importSpecifiers(file: string): string[] {
  const source = fs.readFileSync(file, "utf8");
  return [...source.matchAll(/(?:^|\n)\s*(?:import|export)[^"']*from\s*["']([^"']+)["']/g)]
    .map((m) => m[1])
    .filter((s): s is string => s !== undefined);
}

describe("W0b-4 Workers 런타임 호환 (zod 외 의존 0)", () => {
  it("런타임 소스의 import는 zod와 상대 경로뿐이다 (Node 내장 모듈 0)", () => {
    for (const file of runtimeSources()) {
      for (const spec of importSpecifiers(file)) {
        const ok = spec === "zod" || spec.startsWith("./") || spec.startsWith("../");
        expect(ok, `${path.basename(file)}의 import "${spec}"는 Workers 비호환 가능성`).toBe(true);
      }
    }
    expect(runtimeSources().length).toBeGreaterThan(0);
  });

  it("package.json dependencies는 zod 단독이다 (conventions §3)", () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(pkgDir, "package.json"), "utf8")) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    expect(Object.keys(pkg.dependencies ?? {})).toEqual(["zod"]);
    expect(pkg.devDependencies ?? {}).toEqual({});
  });
});
