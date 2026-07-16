// 지원성 검사 (재생·분기 전 게이트) — 명세 §7.
//
// 재생 자체는 triangle이 처리하므로 항상 시도 가능("ok"). branch 상태는 어댑터 정책(§5)의
// 사전 예고용이며, UI가 재생 전에 "분기 시 스핀 판정 대체" 같은 배지를 띄우는 근거다(D-10).
import type { RoundEntry } from "./parse.js";

export interface SupportReport {
  playback: "ok"; // 재생은 항상 시도 가능 (triangle 담당)
  branch: {
    kickset: "ok" | "unsupported"; // SRS/SRS+ 외 → unsupported (조작 가능성 변화, 분기 차단)
    board: "ok" | "unsupported"; // 비표준 보드(10/20 아님) → unsupported
    spin: "ok" | "will-substitute"; // 미지원 스핀 모드 → all-mini+ 대체 예고
  };
  formatVersion: number | null; // 실측 샘플 = 19
}

/** 어댑터 §3과 동일 기준의 v1 지원값. 수치·문자열을 재정의하지 않도록 한 곳에 고정. */
const SUPPORTED_KICKSETS = new Set(["SRS", "SRS+"]);
const SUPPORTED_SPIN_BONUSES = new Set(["T-spins", "all-mini+"]);

/**
 * 라운드 항목의 분기 지원성을 사전 보고한다(재생 전 게이트).
 * 판정 기준은 어댑터 명세 §3·§5-5와 대칭이다 — 실제 차단·대체는 `captureBranch`(어댑터)가 수행하고
 * 여기는 그 결과를 UI가 미리 안내하도록 예고할 뿐이다.
 */
export function supportReport(entry: RoundEntry): SupportReport {
  const o = entry.options;

  // §3: kickset 생략 시 "SRS+" 폴백 (지원). SRS-X 등은 unsupported.
  const kickset = o.kickset ?? "SRS+";
  const kicksetStatus = SUPPORTED_KICKSETS.has(kickset) ? "ok" : "unsupported";

  // §5-5: boardwidth/boardheight가 존재하며 10/20이 아니면 비표준 보드.
  const boardUnsupported =
    (o.boardwidth !== undefined && o.boardwidth !== 10) ||
    (o.boardheight !== undefined && o.boardheight !== 20);

  // §3·§5-2: 스핀 모드는 표시만 달라지므로 차단 대신 대체 예고.
  const spinBonuses = o.spinbonuses ?? "all-mini+";
  const spinStatus = SUPPORTED_SPIN_BONUSES.has(spinBonuses) ? "ok" : "will-substitute";

  return {
    playback: "ok",
    branch: {
      kickset: kicksetStatus,
      board: boardUnsupported ? "unsupported" : "ok",
      spin: spinStatus,
    },
    formatVersion: typeof o.version === "number" ? o.version : null,
  };
}
