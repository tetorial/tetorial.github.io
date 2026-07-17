// Tetorial ESLint 설정 — 논리 오류 검사 + conventions §1 의존 방향 강제 (스타일은 Prettier 전담)
import tseslint from "typescript-eslint";
import importPlugin from "eslint-plugin-import";
import eslintConfigPrettier from "eslint-config-prettier";

/**
 * conventions §1 의존 방향 표의 한 행을 no-restricted-paths zones로 전개한다.
 * @param {string} pkg 패키지 디렉터리명 (packages/ 하위)
 * @param {string[]} allowed 임포트가 허용된 packages/ 하위 디렉터리명 목록
 */
function packageZones(pkg, allowed) {
  const message = `conventions §1 의존 방향 위반: ${pkg}는 ${
    allowed.length > 0 ? allowed.join(", ") : "(어떤 패키지도)"
  }만 임포트할 수 있다`;
  return [
    {
      target: `./packages/${pkg}`,
      from: "./packages",
      except: [`./${pkg}`, ...allowed.map((a) => `./${a}`)],
      message,
    },
    { target: `./packages/${pkg}`, from: "./apps", message },
    { target: `./packages/${pkg}`, from: "./workers", message },
  ];
}

// conventions §1 의존 방향 표 1:1 전사
const dependencyZones = [
  ...packageZones("types", []),
  ...packageZones("engine", ["types"]),
  ...packageZones("input", ["engine"]),
  ...packageZones("renderer", ["types"]),
  ...packageZones("adapter-tetrio", ["types"]),
  ...packageZones("replay-tetrio", ["types", "adapter-tetrio"]),
  ...packageZones("sim", ["types", "engine"]),
  // workers/gist-proxy → types만
  {
    target: "./workers/gist-proxy",
    from: "./packages",
    except: ["./types"],
    message: "conventions §1 의존 방향 위반: gist-proxy는 types만 임포트할 수 있다",
  },
  {
    target: "./workers/gist-proxy",
    from: "./apps",
    message: "conventions §1 의존 방향 위반: gist-proxy는 apps를 임포트할 수 없다",
  },
  // apps/web → 모든 packages 허용, workers는 금지 (HTTP로만 통신)
  {
    target: "./apps/web",
    from: "./workers",
    message:
      "conventions §1 의존 방향 위반: apps/web은 workers를 임포트할 수 없다 (Worker와는 HTTP로 통신)",
  },
];

export default tseslint.config(
  {
    ignores: [
      "**/node_modules/",
      "**/coverage/",
      "fixtures/",
      ".worktrees/", // 병렬 세션용 리포 내부 worktree (D-17)
      // astro 빌드·E2E 산출물 (apps/web QUESTIONS Q3 — 로컬 빌드 후 lint 실패 방지)
      "apps/web/dist/",
      "apps/web/.astro/",
      "apps/web/playwright-report/",
      "apps/web/test-results/",
      "apps/web/.wrangler/", // wrangler pages dev 생성물 (apps/web 구 QUESTIONS Q1과 동일 사유 — M3-B 게이트 승인)
    ],
  },
  ...tseslint.configs.recommended,
  {
    files: ["**/*.ts", "**/*.tsx"],
    plugins: { import: importPlugin },
    settings: {
      "import/resolver": {
        typescript: { project: "./tsconfig.base.json" },
      },
    },
    rules: {
      "import/no-restricted-paths": ["error", { zones: dependencyZones }],
    },
  },
  {
    // D-2: 결정론·타입 패키지에서 triangle(@haelp/teto) 임포트 금지
    // 단 conventions §4의 골든 대조 테스트(E-3·E-4 등)는 devDependency로 허용 —
    // 테스트·테스트 하네스는 제외한다 (2026-07-11, W1 engine QUESTIONS 1)
    files: ["packages/types/**", "packages/engine/**", "packages/sim/**"],
    ignores: ["**/*.test.ts", "**/src/testing/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            { name: "@haelp/teto", message: "D-2: types/engine/sim에서 triangle 임포트 금지" },
          ],
          patterns: [
            { group: ["@haelp/teto/*"], message: "D-2: types/engine/sim에서 triangle 임포트 금지" },
          ],
        },
      ],
    },
  },
  eslintConfigPrettier,
);
