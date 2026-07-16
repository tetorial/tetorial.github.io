// Vitest workspace 구성 — 루트 `pnpm test` 한 번으로 전 패키지 실행 (conventions §4)
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    passWithNoTests: true, // W0 빈 골격에서도 CI green 유지
    projects: [
      "apps/*",
      "workers/*",
      "packages/*",
      {
        test: {
          name: "infra",
          include: ["tools/infra/**/*.test.ts"],
        },
      },
    ],
  },
});
