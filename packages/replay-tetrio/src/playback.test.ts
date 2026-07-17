// RT-2 재생 결정론 회귀 — 구명세 replay-tetrio §9
// fixture는 익명화본(D-16). 유저명만 치환됐고 게임 데이터는 원본 그대로이므로 실측 수치 불변.
import { describe, expect, it } from "vitest";
import { parseReplay } from "./parse.js";
import { TetrioPlayback } from "./playback.js";
import {
  hasSeedTtr,
  hasTtr,
  hasTtrm,
  loadSeedTtrDoc,
  loadTtrDoc,
  loadTtrmDoc,
} from "./testing/fixtures.js";

const LONG = 120_000; // 전체 리플레이 다회 재생 — 기본 타임아웃 상향

/** 스파이크 실측 로그 (§9 RT-2). [라운드][플레이어] = { frame, pieces, toppedOut } */
const TTRM_ANCHORS: { frame: number; pieces: number; toppedOut: boolean }[][] = [
  [
    { frame: 4862, pieces: 162, toppedOut: false }, // R0 anon-p1 생존
    { frame: 4840, pieces: 91, toppedOut: true }, // R0 anon-p2 toppedOut
  ],
  [
    { frame: 1537, pieces: 67, toppedOut: false },
    { frame: 1521, pieces: 31, toppedOut: true },
  ],
  [
    { frame: 1657, pieces: 63, toppedOut: false },
    { frame: 1639, pieces: 28, toppedOut: true },
  ],
];
const TTR_ANCHOR = { frame: 1471, pieces: 100, toppedOut: false };
// W4-a 버그2: seed 1397564605 — 첫 조각 규칙(S/Z/O 금지) 교정 후 실측 완주치.
// 교정 전에는 첫 조각 Z가 원본과 어긋나 frame 981·46배치에서 조기 topout(회귀 앵커).
const SEED_TTR_ANCHOR = { frame: 3669, pieces: 133, toppedOut: false };
const SEED_TTR_FIRST7 = "IOLSTJZ"; // 원본 실측 초기 미노 7개 (triangle 원출력 ZIOLSTJ의 교정본)
const DISALLOWED_FIRST = new Set(["S", "Z", "O"]);

describe("RT-2 재생 결정론 회귀", () => {
  describe.skipIf(!hasTtrm)("ttrm 전 라운드 × 전 플레이어 (fixture — 부재 시 skip)", () => {
    it(
      "완주 결과(프레임·배치·toppedOut)가 스파이크 실측 로그와 일치",
      () => {
        const doc = loadTtrmDoc();
        expect(doc.rounds.length).toBe(TTRM_ANCHORS.length);
        doc.rounds.forEach((round, ri) => {
          round.forEach((_entry, pi) => {
            const pb = new TetrioPlayback(doc, { round: ri, player: pi });
            pb.step(pb.totalFrames); // 이벤트 소진 또는 toppedOut까지
            const anchor = TTRM_ANCHORS[ri]?.[pi];
            expect(anchor, `앵커 누락 R${ri} P${pi}`).toBeDefined();
            expect({
              frame: pb.frame,
              pieces: pb.view.stats.pieces,
              toppedOut: pb.engine.toppedOut,
            }).toEqual(anchor);
            expect(pb.ended).toBe(true);
          });
        });
      },
      LONG,
    );
  });

  describe.skipIf(!hasTtr)("ttr 단판 (fixture — 부재 시 skip)", () => {
    it(
      "완주 결과가 스파이크 실측 로그와 일치 (1471프레임·100배치)",
      () => {
        const doc = loadTtrDoc();
        const pb = new TetrioPlayback(doc, { round: 0, player: 0 });
        pb.step(pb.totalFrames);
        expect({
          frame: pb.frame,
          pieces: pb.view.stats.pieces,
          toppedOut: pb.engine.toppedOut,
        }).toEqual(TTR_ANCHOR);
      },
      LONG,
    );
  });

  describe.skipIf(!hasTtr)("이펙트 이벤트 on() (fixture — 부재 시 skip)", () => {
    it(
      "step 중 lock/clear/end 발화 · seek(조용한 스크럽)에서는 억제",
      () => {
        const doc = loadTtrDoc();

        // step 재생: lock은 배치 수만큼, end는 1회
        const played = new TetrioPlayback(doc, { round: 0, player: 0 });
        let locks = 0;
        let ends = 0;
        played.on("lock", () => (locks += 1));
        played.on("end", () => (ends += 1));
        played.step(played.totalFrames);
        expect(locks).toBe(TTR_ANCHOR.pieces);
        expect(ends).toBe(1);

        // seek 스크럽: 같은 구간을 지나도 이펙트 억제
        const scrubbed = new TetrioPlayback(doc, { round: 0, player: 0 });
        let scrubLocks = 0;
        scrubbed.on("lock", () => (scrubLocks += 1));
        scrubbed.seek(played.totalFrames);
        expect(scrubLocks).toBe(0);
      },
      LONG,
    );
  });
});

/** 합성 ttr 문서(솔로) — 임의 시드로 초기 큐 파생만 검증할 때 사용(이벤트 없음). */
function synthSeedDoc(seed: number, no_szo = true) {
  const r = parseReplay(JSON.stringify({ replay: { events: [], options: { seed, no_szo } } }));
  if (!r.ok) throw new Error(`합성 ttr 파싱 실패: ${r.error.code}`);
  return r.value;
}

/** 재생 시작(frame 0) 시점의 초기 미노 순서 = falling + next 앞부분. */
function initialPieces(pb: TetrioPlayback, n: number): string {
  const { falling, next } = pb.view;
  const first = falling?.type ?? "";
  return (first + next.join("")).slice(0, n);
}

describe("RT-2 / W4-a 버그2 — tetr.io 첫 조각 규칙(S/Z/O 금지)", () => {
  describe.skipIf(!hasSeedTtr)("seed 1397564605 재생 정합 (fixture — 부재 시 skip)", () => {
    it(
      `초기 미노 7개 = ${SEED_TTR_FIRST7} (triangle 원출력 ZIOLSTJ의 교정본)`,
      () => {
        const pb = new TetrioPlayback(loadSeedTtrDoc(), { round: 0, player: 0 });
        expect(initialPieces(pb, 7)).toBe(SEED_TTR_FIRST7);
      },
      LONG,
    );

    it(
      "완주 결과(frame·배치·toppedOut)가 교정본 실측치와 일치 — 조기 topout 회귀 고정",
      () => {
        const pb = new TetrioPlayback(loadSeedTtrDoc(), { round: 0, player: 0 });
        pb.step(pb.totalFrames);
        expect({
          frame: pb.frame,
          pieces: pb.view.stats.pieces,
          toppedOut: pb.engine.toppedOut,
        }).toEqual(SEED_TTR_ANCHOR);
        expect(pb.view.stats.lines).toBe(40); // 40L 완주
      },
      LONG,
    );
  });

  // 시드 property: no_szo 방에서 32비트 경계 등 다양한 시드의 첫 조각은 절대 S/Z/O가 아니다.
  // (교정이 필요한 시드에선 교정이, 그 밖에선 무연산이 적용된다.)
  it("no_szo 방: 첫 조각은 어떤 시드에서도 S/Z/O가 아니다 (32비트 경계 포함)", () => {
    const boundary = [
      0, 1, 2, 7, 42, 1397564605, 2147483646, 2147483647, 2147483648, 4294967295,
    ];
    const sweep = Array.from({ length: 200 }, (_, i) => i * 10_000_003 + 3);
    for (const seed of [...boundary, ...sweep]) {
      const pb = new TetrioPlayback(synthSeedDoc(seed), { round: 0, player: 0 });
      const first = initialPieces(pb, 1);
      expect(DISALLOWED_FIRST.has(first), `seed ${seed} 첫 조각 ${first}`).toBe(false);
    }
  });

  it("no_szo 방: 교정은 순열을 보존한다 — 첫 백 7개가 IOLSTJZ 집합 그대로", () => {
    // seed 1397564605는 원출력이 ZIOLSTJ(Z가 첫 조각) → 교정으로 Z만 뒤로 이동.
    const pb = new TetrioPlayback(synthSeedDoc(1397564605), { round: 0, player: 0 });
    const bag = initialPieces(pb, 7);
    expect(bag).toBe("IOLSTJZ");
    expect([...bag].sort().join("")).toBe("IJLOSTZ"); // 7미노 1개씩(순열 보존)
  });

  it("no_szo가 없는 방(versus 등)은 교정하지 않는다 — 원본 S/Z/O 첫 조각 유지", () => {
    // 같은 시드라도 no_szo=false면 triangle 원출력(ZIOLSTJ)을 그대로 쓴다 (ttrm 라운드 경로).
    const pb = new TetrioPlayback(synthSeedDoc(1397564605, false), { round: 0, player: 0 });
    expect(initialPieces(pb, 7)).toBe("ZIOLSTJ");
  });
});
