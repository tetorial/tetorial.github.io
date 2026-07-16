// W0-a 완료 기준: 의존 방향 위반 샘플이 lint에서 실패함을 확인 (conventions §1·§3, D-2)
import { ESLint } from "eslint";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const eslint = new ESLint({ cwd: repoRoot });

/** 지정 위치의 가상 파일에서 spec을 임포트했을 때 걸리는 경계 규칙 ID 목록 */
async function boundaryErrors(pkgDir: string, spec: string): Promise<string[]> {
  const filePath = path.join(repoRoot, pkgDir, "src", "__lint-boundary-sample__.ts");
  const results = await eslint.lintText(`import "${spec}";\n`, { filePath });
  return (results[0]?.messages ?? [])
    .map((m) => m.ruleId)
    .filter(
      (id): id is string => id === "import/no-restricted-paths" || id === "no-restricted-imports",
    );
}

describe("W0a-1 의존 방향 lint 강제 (conventions §1 표)", () => {
  const violations: [pkgDir: string, spec: string][] = [
    ["packages/types", "@tetorial/engine"],
    ["packages/engine", "@tetorial/sim"],
    ["packages/engine", "@tetorial/replay-tetrio"],
    ["packages/input", "@tetorial/sim"],
    ["packages/renderer", "@tetorial/engine"],
    ["packages/adapter-tetrio", "@tetorial/engine"],
    ["packages/replay-tetrio", "@tetorial/sim"],
    ["packages/sim", "@tetorial/renderer"],
    ["workers/gist-proxy", "@tetorial/engine"],
    ["apps/web", "@tetorial/gist-proxy"],
  ];
  it.each(violations)("위반: %s → %s 는 lint 오류", async (pkgDir, spec) => {
    expect(await boundaryErrors(pkgDir, spec)).toContain("import/no-restricted-paths");
  });

  const allowed: [pkgDir: string, spec: string][] = [
    ["packages/engine", "@tetorial/types"],
    ["packages/input", "@tetorial/engine"],
    ["packages/renderer", "@tetorial/types"],
    ["packages/adapter-tetrio", "@tetorial/types"],
    ["packages/replay-tetrio", "@tetorial/types"],
    ["packages/replay-tetrio", "@tetorial/adapter-tetrio"],
    ["packages/sim", "@tetorial/types"],
    ["packages/sim", "@tetorial/engine"],
    ["workers/gist-proxy", "@tetorial/types"],
    ["apps/web", "@tetorial/sim"],
  ];
  it.each(allowed)("허용: %s → %s 는 통과", async (pkgDir, spec) => {
    expect(await boundaryErrors(pkgDir, spec)).toEqual([]);
  });
});

describe("W0a-2 D-2 triangle 임포트 금지 (types/engine/sim)", () => {
  it.each([["packages/types"], ["packages/engine"], ["packages/sim"]])(
    "위반: %s → @haelp/teto 는 lint 오류",
    async (pkgDir) => {
      expect(await boundaryErrors(pkgDir, "@haelp/teto")).toContain("no-restricted-imports");
    },
  );

  it.each([["packages/replay-tetrio"], ["packages/adapter-tetrio"]])(
    "허용: %s → @haelp/teto 는 경계 규칙에 걸리지 않음",
    async (pkgDir) => {
      expect(await boundaryErrors(pkgDir, "@haelp/teto")).toEqual([]);
    },
  );
});
