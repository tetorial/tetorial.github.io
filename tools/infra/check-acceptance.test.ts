// M2B-1 완료 기준: check-acceptance가 브랜치의 docs/specs를 glob해 수용 기준 ID↔테스트를
// 대조하고, 명세 없는 main에서는 통과한다 (#23, WORKFLOW §4·게이트 9항).
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

// @ts-expect-error — 검사 도구는 타입 선언 없는 .mjs (빌드 없는 internal-packages 패턴)
import { checkAcceptance, extractCriteria } from "../check-acceptance.mjs";

const SPEC = [
  "# Tetorial 명세: 예시",
  "",
  "본문 인용은 수집되지 않는다: **D-20**, **M9Z-9**.",
  "",
  "## 수용 기준 (작업 세션 완료 조건)",
  "",
  "- **T-1 테스트 대응 항목**: 테스트 이름 인용 필수",
  "- **T-2 문서 전용 항목** [문서]: 테스트 면제",
  "- **T-3 미구현 항목**: 아직 테스트 없음",
].join("\n");

describe("M2B-1 check-acceptance — 브랜치 명세 glob 대조 (#23)", () => {
  const roots: string[] = [];
  const makeRoot = () => {
    const root = mkdtempSync(join(tmpdir(), "check-acceptance-"));
    roots.push(root);
    return root;
  };
  afterAll(() => {
    for (const root of roots) rmSync(root, { recursive: true, force: true });
  });

  it("M2B-1 수용 기준 불릿만 수집하고 본문 굵은 인용(D-20)은 무시한다", () => {
    expect(extractCriteria(SPEC)).toEqual([
      { id: "T-1", docOnly: false },
      { id: "T-2", docOnly: true },
      { id: "T-3", docOnly: false },
    ]);
  });

  it("M2B-1 docs/specs 부재(main) 시 skip으로 통과한다", () => {
    expect(checkAcceptance(makeRoot())).toEqual({ skipped: true });
  });

  it("M2B-1 명세 ID가 테스트 이름에 없으면 missing으로 보고한다", () => {
    const root = makeRoot();
    mkdirSync(join(root, "docs", "specs"), { recursive: true });
    writeFileSync(join(root, "docs", "specs", "example.md"), SPEC);
    mkdirSync(join(root, "packages", "example", "src"), { recursive: true });
    writeFileSync(
      join(root, "packages", "example", "src", "example.test.ts"),
      'it("T-1 테스트 대응 항목", () => {});\n',
    );

    const res = checkAcceptance(root);
    expect(res.skipped).toBe(false);
    expect(res.specCount).toBe(1);
    // T-1: 테스트 인용 → 충족. T-2: [문서] 면제. T-3: 미구현 → 누락.
    expect(res.missing).toEqual(["T-3"]);
  });
});
