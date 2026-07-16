// triangle convert() 기본값 폴백 표 — 명세 §4.
//
// 출처: triangle(@haelp/teto) 청사진 `test/engine/replay.ts`의 convert()가 각 옵션에
// 적용하는 `?? 리터럴` 값을 한 곳에 모은 것이다. 스파이크 JS 포팅본
// (`tools/spike/run_replay.mjs`)에서 실물 리플레이 전 라운드 재생으로 검증됐다.
//
// 규칙(명세 §4):
//   - 실물 ttrm/ttr은 옵션 다수를 생략한다(샘플에서 bagtype·kickset 등 부재 확인) →
//     생략 시 여기 값으로 폴백한다.
//   - 값은 청사진과 **자구까지 동일**하게 유지한다. RT-2 재생 회귀 앵커가 이 표의 정확성을 고정한다.

/** 옵션 생략 시 convert가 적용하는 폴백 값 (청사진 `?? 리터럴` 1:1 전사). */
export const CONVERT_DEFAULTS = {
  kickset: "SRS+",
  // board: 청사진의 교차 대입 — width ← boardheight, height ← boardwidth (스파이크 R-1).
  //        기본 보드에서만 실행 경로에 들어온다(§7 지원성 검사가 비표준 보드를 사전 차단).
  boardWidthFromHeight: 10, // board.width = options.boardheight ?? 10
  boardHeightFromWidth: 20, // board.height = options.boardwidth ?? 20
  boardBuffer: 20,
  queueMinLength: 10,
  bagtype: "7-bag",
  comboTable: "multiplier",
  garbageBlocking: "combo blocking",
  clutch: true,
  garbageTargetBonus: "none",
  spinBonuses: "all-mini+",
  usebombs: false,
  garbageAbsoluteCap: 0,
  garbageCapIncrease: 0,
  garbageCapMax: 40,
  garbageCap: 8,
  garbageCapMargin: 0,
  garbageBoardWidth: 10, // garbage.boardWidth = options.boardwidth ?? 10
  garbageSpeed: 20,
  garbageHoleSize: 1,
  messinessChange: 1,
  messinessNosame: false,
  messinessTimeout: 0,
  messinessInner: 0,
  messinessCenter: false,
  garbageMultiplier: 1,
  garbageIncrease: 0.008,
  garbageMargin: 10800,
  garbageSpecialBonus: false,
  openerPhase: 0,
  roundmode: "down",
  g: 0.02,
  gIncrease: 0,
  gMargin: 0,
  arr: 0,
  das: 6,
  dcd: 0,
  sdf: 41,
  safelock: false,
  cancel: false,
  may20g: true,
  irs: "tap",
  ihs: "tap",
  b2bChargeAt: 4,
  b2bChargeBase: 3,
  allclearB2b: 0,
  allclearGarbage: 0,
  allowHardDrop: true,
  allow180: true,
  displayHold: true,
  canRetry: false,
  canUndo: false,
  infiniteHold: false,
  lockResets: 15,
  lockTime: 30,
  gravityMay20g: true,
  stride: false,
  passthrough: "zero",
} as const;

/**
 * 엔진 초기화용 고정 시각. 코어는 무시간(§5)이므로 실제 시계를 읽지 않는다 —
 * 결정론(RT-2·RT-4)을 위해 현재 시각(`new Date()`) 대신 고정 상수를 쓴다.
 * (misc.date는 재생 로직에 관여하지 않으나 엔진 재생성 경로까지 완전 결정론으로 만든다.)
 */
export const ENGINE_INIT_DATE = new Date("2026-01-01T00:00:00Z");
