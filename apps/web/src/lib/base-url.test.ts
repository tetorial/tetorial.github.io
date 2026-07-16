import { describe, it, expect } from "vitest";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { withBase, scanForHardcodedPaths } from "./base-url.js";

// AW-1 빌드·라우팅: 전 내부 링크·에셋에 base 반영(스캔 검증). base path 헬퍼(D-13·D-18).
describe("AW-1 base path 헬퍼", () => {
  it("AW-1 루트 배포(base '/')에서 내부 경로에 base 접두", () => {
    expect(withBase("replay", "/")).toBe("/replay");
    expect(withBase("/replay", "/")).toBe("/replay");
    expect(withBase("assets/app.css", "/")).toBe("/assets/app.css");
  });

  it("AW-1 하위 경로 배포(base '/tetorial/')에서도 헬퍼가 접두를 붙인다", () => {
    expect(withBase("replay", "/tetorial/")).toBe("/tetorial/replay");
    expect(withBase("/replay", "/tetorial")).toBe("/tetorial/replay");
    expect(withBase("assets/x.png", "/tetorial/")).toBe("/tetorial/assets/x.png");
  });

  it("AW-1 외부 URL·앵커·프로토콜 상대는 변형하지 않는다", () => {
    expect(withBase("https://tetr.io", "/tetorial/")).toBe("https://tetr.io");
    expect(withBase("//cdn.example/x.js", "/tetorial/")).toBe("//cdn.example/x.js");
    expect(withBase("#top", "/tetorial/")).toBe("#top");
    expect(withBase("mailto:a@b.c", "/tetorial/")).toBe("mailto:a@b.c");
  });
});

describe("AW-1 하드코딩 경로 스캔", () => {
  it("AW-1 base 미경유 루트 절대 경로를 위반으로 잡는다(비루트 base)", () => {
    const html = `<a href="/replay">가기</a><link href="/tetorial/style.css"><img src="/logo.png">`;
    const v = scanForHardcodedPaths(html, "/tetorial/");
    const values = v.map((x) => x.value).sort();
    expect(values).toEqual(["/logo.png", "/replay"]); // /tetorial/* 은 정상
  });

  it("AW-1 외부·프로토콜 상대·해시는 위반이 아니다", () => {
    const html = `<a href="https://x.y/z">e</a><script src="//cdn/x.js"></script><a href="#a">a</a>`;
    expect(scanForHardcodedPaths(html, "/tetorial/")).toEqual([]);
  });

  it("AW-1 srcset의 각 후보 URL을 검사한다", () => {
    const html = `<img srcset="/a.png 1x, /tetorial/b.png 2x">`;
    const v = scanForHardcodedPaths(html, "/tetorial/");
    expect(v.map((x) => x.value)).toEqual(["/a.png"]);
  });

  // 실제 빌드 산출물이 있으면(게이트/CI) base 접두 위반을 스캔한다. 없으면 skip(단위 실행).
  it("AW-1 빌드 산출물(dist) 내부 링크 base 반영 스캔", () => {
    // apps/web/src/lib → apps/web/dist (cwd 비의존 앵커)
    const dist = fileURLToPath(new URL("../../dist", import.meta.url));
    if (!existsSync(dist)) return; // 빌드 전에는 skip
    const htmlFiles: string[] = [];
    const walk = (dir: string): void => {
      for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        if (statSync(p).isDirectory()) walk(p);
        else if (name.endsWith(".html")) htmlFiles.push(p);
      }
    };
    walk(dist);
    // 루트 배포(base "/")에서는 위반이 정의상 없어야 한다. 하위 경로 회귀는 helper로 방어됨.
    for (const f of htmlFiles) {
      const violations = scanForHardcodedPaths(readFileSync(f, "utf8"), "/");
      expect(violations, `${f}: ${JSON.stringify(violations)}`).toEqual([]);
    }
    expect(htmlFiles.length).toBeGreaterThan(0);
  });
});
