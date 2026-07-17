import { describe, it, expect, vi } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { openLocalReplay, openGistReplay, originalRound, branchOrigin } from "./open-replay.js";
import { createPlaybackSession, type PlaybackTimers } from "./playback-session.js";
import { buildUploadPayload } from "./upload.js";
import { WorkerClient } from "./worker-client.js";
import { parseReplay } from "@tetorial/replay-tetrio";

const FIXTURE_ROOT = fileURLToPath(new URL("../../../../fixtures", import.meta.url));
const TTRM = join(FIXTURE_ROOT, "replay_sample.ttrm");
const TTR = join(FIXTURE_ROOT, "sprint_rep_sample.ttr");

function loadText(path: string): string | null {
  return existsSync(path) ? readFileSync(path, "utf8") : null;
}

/** 수동 타이머 하네스 — clock을 결정론적으로 구동. */
function manualTimers(): PlaybackTimers & { advance: (ms: number) => void } {
  let now = 0;
  let pending: (() => void) | null = null;
  return {
    now: () => now,
    schedule: (cb: () => void) => {
      pending = cb;
      return 1;
    },
    cancel: () => {
      pending = null;
    },
    advance(ms: number) {
      now += ms;
      const cb = pending;
      pending = null;
      cb?.();
    },
  };
}

// AW-2 로컬 열기: 파싱 → 라운드/플레이어 → 재생 → seek → 배속.
describe("AW-2 로컬 열기·재생", () => {
  it("AW-2 로컬 파싱 성공 + roundMap 항등", () => {
    const text = loadText(TTRM);
    if (!text) return;
    const res = openLocalReplay(text);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.loaded.source).toBe("local");
      expect(res.loaded.roundMap).toEqual(res.loaded.doc.rounds.map((_, i) => i));
      expect(res.loaded.meta).toBeNull();
    }
  });

  it("AW-2 잘못된 형식은 손상/형식 오류", () => {
    const res = openLocalReplay("this is not json");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.source).toBe("integrity");
  });

  it("AW-2 재생 → seek → 프레임 스텝 → 배속", () => {
    const text = loadText(TTR) ?? loadText(TTRM);
    if (!text) return;
    const parsed = parseReplay(text);
    if (!parsed.ok) throw new Error("fixture 파싱 실패");
    const timers = manualTimers();
    const session = createPlaybackSession(parsed.value, { round: 0, player: 0 }, timers);

    expect(session.frame).toBe(0);
    session.play();
    timers.advance(1000); // 60fps × 1s = 약 60프레임 진행
    const afterPlay = session.frame;
    expect(afterPlay).toBeGreaterThan(0);
    session.pause();
    expect(session.playing).toBe(false);

    session.seek(10); // 임의 프레임(뒤로)
    expect(session.frame).toBe(10);
    session.step(5); // 프레임 스텝
    expect(session.frame).toBe(15);

    session.setSpeed(2);
    expect(session.speed).toBe(2);
    session.setSpeed(100); // 0.25~4× 클램프
    expect(session.speed).toBe(4);

    // 분기 캡처는 항상 프레임 경계 → CaptureResult 반환
    const branch = session.captureBranch();
    expect(typeof branch.ok).toBe("boolean");
    session.dispose();
  });
});

// AW-4 gist 열기: index → rawUrl fetch → 무결성 대조 → 재생. 손상·404 분기.
describe("AW-4 gist 열기·무결성", () => {
  async function buildGistWorker(overrides?: {
    corruptSha?: boolean;
    status404?: boolean;
    missingReplay?: boolean;
  }): Promise<{ worker: WorkerClient; roundMap: number[] }> {
    const text = loadText(TTRM);
    if (!text) throw new Error("no fixture");
    const parsed = parseReplay(text);
    if (!parsed.ok) throw new Error("parse");
    const doc = parsed.value;
    const selected = doc.rounds.map((_, i) => i);
    const payload = await buildUploadPayload({ doc, selectedRounds: selected });
    const meta = overrides?.corruptSha
      ? { ...payload.meta, replay: { ...payload.meta.replay, sha256: "0".repeat(64) } }
      : payload.meta;

    const metaText = JSON.stringify(meta);
    const replayText = payload.replayBody;
    const index = {
      gistId: "g1",
      files: [
        ...(overrides?.missingReplay
          ? []
          : [{ name: "replay.ttrm.gz.b64", size: 1, rawUrl: "raw://replay", truncated: false }]),
        { name: "meta.json", size: 1, rawUrl: "raw://meta", truncated: false },
      ],
      fetchedAt: "2026-07-12T00:00:00.000Z",
    };

    const fetchImpl = vi.fn(async (url: string) => {
      if (overrides?.status404 && url.endsWith("/g/g1")) {
        return new Response(JSON.stringify({ code: "not-found" }), {
          status: 404,
          headers: { "content-type": "application/json" },
        });
      }
      if (url.endsWith("/g/g1")) {
        return new Response(JSON.stringify(index), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      if (url === "raw://meta") return new Response(metaText, { status: 200 });
      if (url === "raw://replay") return new Response(replayText, { status: 200 });
      return new Response("", { status: 404 });
    });
    return {
      worker: new WorkerClient({ baseUrl: "https://w.test", fetchImpl: fetchImpl as typeof fetch }),
      roundMap: payload.roundMap,
    };
  }

  it("AW-4 정상: index → rawUrl → 무결성 통과 → doc + roundMap(원본 번호)", async () => {
    if (!existsSync(TTRM)) return;
    const { worker, roundMap } = await buildGistWorker();
    const res = await openGistReplay("g1", worker);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.loaded.roundMap).toEqual(roundMap);
      expect(res.loaded.meta).not.toBeNull();
      expect(res.loaded.source).toEqual({ gistId: "g1" });
      // 원본 라운드 번호 변환
      expect(originalRound(res.loaded, 0)).toBe(roundMap[0]);
      expect(branchOrigin(res.loaded, 0, 0, 500).round).toBe(roundMap[0]);
    }
  });

  it("AW-4 sha256 불일치 → 손상 문구 분기", async () => {
    if (!existsSync(TTRM)) return;
    const { worker } = await buildGistWorker({ corruptSha: true });
    const res = await openGistReplay("g1", worker);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.source).toBe("integrity");
  });

  it("AW-4 gist 404 → not-found 분기", async () => {
    if (!existsSync(TTRM)) return;
    const { worker } = await buildGistWorker({ status404: true });
    const res = await openGistReplay("g1", worker);
    expect(res.ok).toBe(false);
    if (!res.ok && res.error.source === "worker") {
      expect(res.error.body.code).toBe("not-found");
    } else {
      expect.fail("worker not-found 기대");
    }
  });

  it("AW-4 서비스 규약 외(replay 파일 없음) → not-found", async () => {
    if (!existsSync(TTRM)) return;
    const { worker } = await buildGistWorker({ missingReplay: true });
    const res = await openGistReplay("g1", worker);
    expect(res.ok).toBe(false);
  });
});

// AW-25 originalRound 단일화(#47) — 표시 라운드 번호 계산은 이 헬퍼 한 경로만 쓴다.
// 손계산(roundMap 직접 인덱싱 `?? i`)과의 동등 동작(부재·희소 인덱스 fallback)을 고정한다.
describe("AW-25 originalRound 헬퍼", () => {
  it("AW-25 roundMap 매핑: 발췌 업로드의 원본 라운드 번호를 되돌린다", () => {
    expect(originalRound([2, 5, 7], 0)).toBe(2);
    expect(originalRound([2, 5, 7], 2)).toBe(7);
  });

  it("AW-25 범위 밖 인덱스는 항등 fallback(?? i)", () => {
    expect(originalRound([2, 5], 3)).toBe(3);
    expect(originalRound([], 0)).toBe(0);
  });

  it("AW-25 희소 인덱스(빈 슬롯)도 항등 fallback", () => {
    const sparse: number[] = [];
    sparse[2] = 9;
    expect(originalRound(sparse, 0)).toBe(0);
    expect(originalRound(sparse, 1)).toBe(1);
    expect(originalRound(sparse, 2)).toBe(9);
  });

  it("AW-25 LoadedReplay 오버로드는 roundMap 경로와 동등", () => {
    const text = loadText(TTRM);
    if (!text) return;
    const res = openLocalReplay(text);
    if (!res.ok) throw new Error("fixture 파싱 실패");
    for (let i = 0; i < res.loaded.doc.rounds.length + 1; i++) {
      expect(originalRound(res.loaded, i)).toBe(originalRound(res.loaded.roundMap, i));
    }
  });
});
