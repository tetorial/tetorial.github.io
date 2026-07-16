// S-8 오버레이 경로 — highlight 스트로크(API 레벨) → 캡처 → 직렬화 → 복원 왕복
// (UI 미구현과 무관하게 데이터 경로 검증) (명세 §3-2·§7)
import { pageStateSchema } from "@tetorial/types";
import { describe, expect, it } from "vitest";
import { createAuthoringSession, restoreAuthoringSession } from "./authoring.js";
import { createViewerSession } from "./viewer.js";
import { makeReplayOrigin, makeSnapshot } from "./testing/fixtures.js";

describe("S-8 오버레이 경로", () => {
  it("highlight 스트로크 → 캡처 → 직렬화 → 복원 왕복 (+ viewer 표시)", () => {
    const s = createAuthoringSession({ origin: makeReplayOrigin(), snapshot: makeSnapshot() });

    s.beginStroke({ kind: "highlight" });
    s.strokeTo({ x: 2, y: 0 });
    s.strokeTo({ x: 3, y: 0 });
    s.strokeTo({ x: 2, y: 1 });
    s.endStroke();

    // 작업 뷰에 오버레이 반영
    expect(s.work.overlays.highlights).toEqual(["__HH______", "__H_______"]);

    // 캡처 → PageState.overlays
    const page = s.addPage();
    expect(page.state.overlays?.highlights).toEqual(["__HH______", "__H_______"]);
    // types의 pageStateSchema 통과 (전방 호환 인코딩)
    expect(pageStateSchema.safeParse(page.state).success).toBe(true);

    // 직렬화 → 복원 왕복
    const r = restoreAuthoringSession(s.serialize());
    expect(r.work.overlays).toEqual(s.work.overlays);

    // 열람 세션에서도 오버레이 보존
    const viewer = createViewerSession(s.toNote());
    expect(viewer.selectById(page.id)).toBe(true);
    expect(viewer.view?.overlays.highlights).toEqual(page.state.overlays?.highlights);
  });

  it("highlight 스트로크는 언두 1단위 — undo 시 오버레이가 사라진다", () => {
    const s = createAuthoringSession({ origin: makeReplayOrigin(), snapshot: makeSnapshot() });
    s.beginStroke({ kind: "highlight" });
    s.strokeTo({ x: 4, y: 2 });
    s.endStroke();
    expect(s.work.overlays.highlights.length).toBeGreaterThan(0);
    expect(s.canUndo).toBe(true);
    s.undo();
    expect(s.work.overlays.highlights).toEqual([]);
  });
});
