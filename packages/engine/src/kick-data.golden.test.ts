// E-3 킥테이블 동등성: 동봉 데이터가 triangle(@haelp/teto)의 kicks/data export와
// 값 단위로 일치하는 스냅샷 테스트 (부록 §7 — 데이터 부패 방지)
import { describe, expect, it } from "vitest";
import triangleData from "./data/triangle-data.json";
import { kickData } from "./testing/triangle-harness.js";

describe("E-3 킥테이블 동등성", () => {
  it("SRS 킥 데이터가 @haelp/teto kickData.SRS와 deep equal", () => {
    expect(triangleData.kicks.SRS).toEqual(kickData.SRS);
  });

  it("SRS+ 킥 데이터가 @haelp/teto kickData['SRS+']와 deep equal", () => {
    expect(triangleData.kicks["SRS+"]).toEqual(kickData["SRS+"]);
  });

  it("동봉 데이터의 킥테이블 키는 SRS·SRS+ 전부다 (v1 지원 범위, 명세 §5)", () => {
    expect(Object.keys(triangleData.kicks).sort()).toEqual(["SRS", "SRS+"]);
  });
});
