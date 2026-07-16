// apps/web 유닛/조립 테스트 구성 — 순수 유틸·헤드리스 스토어(AW-1~AW-10)를 node 환경에서 검증.
// Preact 컴포넌트 렌더 검증은 Playwright 스모크(e2e/)가 담당한다(명세 §7).
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "web",
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
