// E-7 환경: 브라우저·Node 어디서든 동작 — DOM 무접촉·Node 내장 미사용·의존성 0을
// 런타임 소스 정적 검사로 강제한다 (types 패키지 W0b-4와 동일한 접근).
// 테스트 자체는 Node/Vitest에서 돌지만 검사 대상은 소비자(브라우저 포함)에 배포되는 src다.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const srcDir = path.dirname(fileURLToPath(import.meta.url));
const pkgDir = path.resolve(srcDir, "..");

/** 엔진 런타임 소스 (테스트·테스트 하네스 제외) */
function runtimeSources(): string[] {
  return fs
    .readdirSync(srcDir)
    .filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"))
    .map((f) => path.join(srcDir, f));
}

function importStatements(file: string): { spec: string; typeOnly: boolean }[] {
  const source = fs.readFileSync(file, "utf8");
  return [
    ...source.matchAll(/(?:^|\n)\s*(import|export)(\s+type)?[^"']*from\s*["']([^"']+)["']/g),
  ].map((m) => ({ spec: m[3] ?? "", typeOnly: m[2] !== undefined }));
}

describe("E-7 환경 (브라우저·Node 양쪽 동작 가능성)", () => {
  it("런타임 소스의 import는 상대 경로와 @tetorial/types(타입 전용)뿐이다", () => {
    for (const file of runtimeSources()) {
      for (const { spec, typeOnly } of importStatements(file)) {
        const name = path.basename(file);
        if (spec === "@tetorial/types") {
          // 타입 전용이어야 런타임 의존 0이 유지된다 (conventions §1: engine → types만)
          expect(typeOnly, `${name}의 @tetorial/types import는 import type이어야 한다`).toBe(true);
        } else {
          expect(
            spec.startsWith("./") || spec.startsWith("../"),
            `${name}의 import "${spec}"는 브라우저 비호환 가능성 (Node 내장/외부 모듈)`,
          ).toBe(true);
        }
      }
    }
    expect(runtimeSources().length).toBeGreaterThan(0);
  });

  it("런타임 소스는 DOM·전역 환경·비결정 API에 접촉하지 않는다", () => {
    const banned = [
      /\bdocument\./,
      /\bwindow\./,
      /\bnavigator\./,
      /\bprocess\./,
      /\brequire\(/,
      /\bMath\.random\b/, // 결정론 (conventions §5)
      /\bnew Date\b|\bDate\.now\b/, // 결정론 (conventions §5)
    ];
    for (const file of runtimeSources()) {
      const source = fs.readFileSync(file, "utf8");
      for (const pattern of banned) {
        expect(pattern.test(source), `${path.basename(file)}에서 금지 패턴 발견: ${pattern}`).toBe(
          false,
        );
      }
    }
  });

  it("package.json dependencies는 빈 객체다 (명세 §3 런타임 의존성 0)", () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(pkgDir, "package.json"), "utf8")) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    expect(pkg.dependencies ?? {}).toEqual({});
    // 골든 대조용 @haelp/teto는 테스트 전용 devDependency로만 존재 (conventions §4)
    expect(Object.keys(pkg.devDependencies ?? {})).toContain("@haelp/teto");
  });

  it("공개 API는 src/index.ts에서만 export된다 (conventions §2)", () => {
    const index = fs.readFileSync(path.join(srcDir, "index.ts"), "utf8");
    expect(index).toMatch(/export \{ SimEngine \}/);
    expect(index).toMatch(/export \{ PRESETS \}/);
  });
});
