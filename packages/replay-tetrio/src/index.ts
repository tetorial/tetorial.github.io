// @tetorial/replay-tetrio 공개 API — 명세의 표면만 export (그 외 추가 금지, conventions §2)
// .ttrm/.ttr 파싱·라운드 발췌·결정론 재생·분기 캡처·표시 캐시 추출.

// §2 파싱과 정규화
export { parseReplay } from "./parse.js";
export type { ReplayDoc, RoundEntry, ParseResult, ParseError } from "./parse.js";

// §4 엔진 초기화 (convert) + ttrm 옵션 규범 타입
export { convert, splitFrames } from "./convert.js";
export type { TetrioRoundOptions, TetrioFrame } from "./convert.js";

// §3 라운드 발췌
export { excerptRounds, roundSizes } from "./excerpt.js";
export type { ExcerptResult } from "./excerpt.js";

// §5 재생 컨트롤러 (결정론 코어)
export { createPlayback } from "./playback.js";
export type { PlaybackController, PlaybackView, PlaybackEffect, CellPos } from "./playback.js";

// §6 재생 시계 (실시간 셸)
export { PlaybackClock } from "./clock.js";
export type { PlaybackClockOptions } from "./clock.js";

// §7 지원성 검사
export { supportReport } from "./support.js";
export type { SupportReport } from "./support.js";

// §8 displayCache 추출
export { extractDisplayCache } from "./display-cache.js";
