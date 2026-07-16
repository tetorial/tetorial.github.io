// EngineControls 계약이 실제 엔진과 어긋나지 않음을 컴파일 타임에 고정한다.
// engine은 EngineControls를 export하지 않으므로 input이 구조적 부분집합으로 소유한다(§4).
// 타입 전용 임포트 → 런타임 의존 없음(erased). conventions §1 의존 방향(input→engine) 허용.
import type { SimEngine } from "@tetorial/engine";
import { describe, expect, it } from "vitest";
import type { EngineControls } from "./types.js";

// SimEngine이 EngineControls를 만족하지 않으면 `never`가 되어 `const ok: never = true`가 컴파일 실패.
type SimEngineSatisfiesControls = SimEngine extends EngineControls ? true : never;

describe("EngineControls 구조적 호환", () => {
  it("SimEngine은 EngineControls를 구조적으로 만족한다 (컴파일 타임 보증)", () => {
    const ok: SimEngineSatisfiesControls = true;
    expect(ok).toBe(true);
  });
});
