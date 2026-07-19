import { describe, it, expect } from "vitest";
import { STYLES } from "./PlaybackControls.tsx";

// M6-C 형태 계약(AW-42·43) — 실렌더 관측은 e2e/m6c-markers.spec.ts가 담당하고, 여기서는 컴포넌트가
// 실제로 그 스타일 규칙을 싣고 있는지(원형→직사각형/화살촉 교체)를 회귀 방지로 고정한다.
// 세부 형태(치수·다각형 좌표)는 게이트 11항에서 교체될 수 있으므로 "원형이 아님 + 교체 형태"까지만 본다.
describe("AW-42 재생 슬라이더 핸들 계약", () => {
  it("AW-42 핸들을 네이티브 원형에서 세로 직사각형으로 커스텀한다", () => {
    // 커스텀 핸들 교체의 전제 — appearance 리셋.
    expect(STYLES).toMatch(/\.scrubber\s*\{[^}]*appearance:\s*none/);
    // 두 벤더 의사요소로 thumb를 직접 스타일한다(webkit·moz).
    expect(STYLES).toContain("::-webkit-slider-thumb");
    expect(STYLES).toContain("::-moz-range-thumb");
    // 세로 직사각형: thumb는 원형(border-radius:50%)이 아니다.
    const thumb = /::-webkit-slider-thumb\s*\{([^}]*)\}/.exec(STYLES)?.[1] ?? "";
    expect(thumb).not.toMatch(/border-radius:\s*50%/);
  });
});

describe("AW-43 노트 마커 화살촉 계약", () => {
  it("AW-43 마커는 원형이 아니라 화살촉(clip-path 다각형)이다", () => {
    const marker = /\.marker\s*\{([^}]*)\}/.exec(STYLES)?.[1] ?? "";
    expect(marker).toContain("clip-path: polygon(");
    expect(marker).not.toMatch(/border-radius:\s*50%/);
  });
});
