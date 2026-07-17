// base path 헬퍼 (D-13·D-18) — 모든 내부 링크·에셋은 이 헬퍼를 경유한다.
// 배포는 조직 루트 사이트라 base = "/"(기본값)이지만, 하위 경로 이전 대비로 헬퍼 경유를 의무화한다.
// 루트 절대 경로("/replay" 등) 하드코딩 금지 — AW-1이 빌드 산출물을 스캔 검증한다.

/** Astro가 주입하는 base. 테스트(vitest)에서는 import.meta.env.BASE_URL이 "/"로 온다. */
function currentBase(): string {
  const base = import.meta.env.BASE_URL;
  return typeof base === "string" && base.length > 0 ? base : "/";
}

/** base 끝에 정확히 하나의 슬래시를 보장한다. */
function normalizeBase(base: string): string {
  return base.endsWith("/") ? base : base + "/";
}

/**
 * 내부 경로를 base 접두가 붙은 URL로 변환한다.
 * @param path 앱 루트 기준 경로(예: "replay", "/replay", "assets/x.png")
 * @param base 테스트용 주입(생략 시 import.meta.env.BASE_URL)
 */
export function withBase(path: string, base: string = currentBase()): string {
  const b = normalizeBase(base);
  // 외부 URL·앵커·프로토콜 상대는 그대로 둔다.
  if (/^([a-z]+:)?\/\//i.test(path) || path.startsWith("#") || path.startsWith("mailto:")) {
    return path;
  }
  const rel = path.replace(/^\/+/, "");
  return b + rel;
}

/**
 * location.pathname에서 base 접두를 벗겨 앱 루트 기준 경로("/replays/x" 등)를 얻는다.
 * 경로형 딥링크 파서(deeplink.ts)가 사용한다 — 루트 절대 경로 하드코딩 금지(AW-1)의
 * 수신 측 대칭. base 접두가 없으면 원문을 그대로 반환한다(방어적).
 */
export function stripBase(pathname: string, base: string = currentBase()): string {
  const b = normalizeBase(base);
  if (pathname === b || `${pathname}/` === b) return "/";
  return pathname.startsWith(b) ? `/${pathname.slice(b.length)}` : pathname;
}

/** 내부 링크·에셋 후보로 볼 속성 목록. */
const URL_ATTRS = ["href", "src", "srcset", "action", "poster"] as const;

export interface PathViolation {
  attr: string;
  value: string;
}

/**
 * 빌드 산출 HTML에서 base를 경유하지 않은 루트 절대 경로 내부 링크를 찾는다(AW-1 스캔).
 *
 * - base가 "/"가 아닌 경우: base 접두 없이 "/"로 시작하는 내부 경로는 위반이다.
 * - base가 "/"인 경우(현 배포): 루트 절대 경로가 곧 정상이므로, `//`(프로토콜 상대)나
 *   명백한 외부 호스트만 제외하고 위반은 발생하지 않는다. 헬퍼 경유 여부는 base를
 *   비루트로 바꾼 산출물에서만 판별 가능하므로, 이 스캔은 base 파라미터로 구동한다.
 */
export function scanForHardcodedPaths(html: string, base: string): PathViolation[] {
  const b = normalizeBase(base);
  const violations: PathViolation[] = [];
  for (const attr of URL_ATTRS) {
    const re = new RegExp(`${attr}\\s*=\\s*"([^"]*)"`, "gi");
    for (const m of html.matchAll(re)) {
      const value = m[1] ?? "";
      for (const url of splitAttr(attr, value)) {
        if (isInternalRootAbsolute(url) && !url.startsWith(b)) {
          violations.push({ attr, value: url });
        }
      }
    }
  }
  return violations;
}

/** srcset은 쉼표로 여러 후보(URL + 디스크립터)를 담는다. 그 외는 단일 URL. */
function splitAttr(attr: string, value: string): string[] {
  if (attr !== "srcset") return [value];
  return value
    .split(",")
    .map((part) => part.trim().split(/\s+/)[0] ?? "")
    .filter((u) => u.length > 0);
}

/** 내부 루트 절대 경로("/x")인가? 프로토콜 상대("//host")·외부 URL·데이터/앵커는 제외. */
function isInternalRootAbsolute(url: string): boolean {
  if (!url.startsWith("/")) return false;
  if (url.startsWith("//")) return false; // 프로토콜 상대 = 외부
  return true;
}
