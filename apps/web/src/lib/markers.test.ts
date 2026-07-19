import { describe, it, expect } from "vitest";
import type { Note } from "@tetorial/types";
import {
  collectMarkers,
  collectMarkersForPlayers,
  clusterMarkers,
  markerRatio,
  type NoteFileRef,
} from "./markers.js";

function replayNote(id: string, round: number, player: number, frame: number, comment?: string): Note {
  return {
    id,
    origin: { type: "replay", round, player, frame },
    snapshot: {
      ruleset: { preset: "srs" },
      board: { width: 10, rows: [] },
      current: "T",
      hold: null,
      holdLocked: false,
      queue: "IJLOSTZ",
      counters: { b2b: -1, combo: -1 },
    },
    pages: [
      {
        id: `${id}pg01`.slice(0, 8),
        state: {
          board: { width: 10, rows: [] },
          current: "T",
          hold: null,
          holdLocked: false,
          queueUsed: 0,
          counters: { b2b: -1, combo: -1 },
        },
        ...(comment ? { comment } : {}),
      },
    ],
    createdAt: "1970-01-01T00:00:00.000Z",
    updatedAt: "1970-01-01T00:00:00.000Z",
  };
}

// AW-10 마커·딥링크: 노트 마커 위치·클러스터.
describe("AW-10 노트 마커 수집", () => {
  it("AW-10 현재 라운드·플레이어의 replay 진입 노트만 프레임순으로 수집", () => {
    const files: NoteFileRef[] = [
      {
        clientId: "k3XmP9qLwR2v",
        authorName: "corun",
        notes: [
          replayNote("aaaaaaaa", 0, 0, 500, "TSD 가능"),
          replayNote("bbbbbbbb", 0, 0, 100),
          replayNote("cccccccc", 1, 0, 300), // 다른 라운드
          replayNote("dddddddd", 0, 1, 200), // 다른 플레이어
        ],
      },
    ];
    const markers = collectMarkers(files, { round: 0, player: 0 });
    expect(markers.map((m) => m.noteId)).toEqual(["bbbbbbbb", "aaaaaaaa"]);
    expect(markers[0]?.frame).toBe(100);
    expect(markers[1]?.firstComment).toBe("TSD 가능");
    expect(markers[0]?.authorName).toBe("corun");
  });

  it("AW-10 여러 파일의 마커를 합친다", () => {
    const files: NoteFileRef[] = [
      { clientId: "aaaaaaaaaaaa", notes: [replayNote("11111111", 0, 0, 50)] },
      { clientId: "bbbbbbbbbbbb", notes: [replayNote("22222222", 0, 0, 40)] },
    ];
    const markers = collectMarkers(files, { round: 0, player: 0 });
    expect(markers.map((m) => m.frame)).toEqual([40, 50]);
  });
});

// AW-40 노트 호환: 양보드 재생 시 표시 중인 두 플레이어의 노트를 한 타임라인에 모으되,
// 각 노트는 origin.player(실제 플레이어 인덱스) 기준으로 귀속된다 — 스왑과 무관하다.
describe("AW-40 양보드 마커 합집합(실제 플레이어 인덱스 기준)", () => {
  const files: NoteFileRef[] = [
    {
      clientId: "k3XmP9qLwR2v",
      notes: [
        replayNote("p0aaaaaa", 0, 0, 300, "P0 노트"),
        replayNote("p1bbbbbb", 0, 1, 100, "P1 노트"),
        replayNote("p0cccccc", 0, 0, 500),
        replayNote("otherrnd", 1, 0, 50), // 다른 라운드 — 제외
      ],
    },
  ];

  it("AW-40 두 플레이어 노트를 프레임순으로 합친다", () => {
    const markers = collectMarkersForPlayers(files, 0, [0, 1]);
    expect(markers.map((m) => m.noteId)).toEqual(["p1bbbbbb", "p0aaaaaa", "p0cccccc"]);
    expect(markers.map((m) => m.frame)).toEqual([100, 300, 500]);
  });

  it("AW-40 플레이어 나열 순서가 바뀌어도(스왑) 마커 결과는 동일 — origin.player 기준", () => {
    const normal = collectMarkersForPlayers(files, 0, [0, 1]);
    const swapped = collectMarkersForPlayers(files, 0, [1, 0]);
    expect(swapped.map((m) => m.noteId)).toEqual(normal.map((m) => m.noteId));
  });

  it("AW-40 솔로(플레이어 1명)는 그 플레이어 노트만 — 현행 동작 유지", () => {
    const markers = collectMarkersForPlayers(files, 0, [0]);
    expect(markers.map((m) => m.noteId)).toEqual(["p0aaaaaa", "p0cccccc"]);
  });
});

describe("AW-10 마커 클러스터링(±60프레임)", () => {
  it("AW-10 60프레임 이내 다수 마커를 하나로 묶는다", () => {
    const markers = collectMarkers(
      [
        {
          clientId: "aaaaaaaaaaaa",
          notes: [
            replayNote("11111111", 0, 0, 100),
            replayNote("22222222", 0, 0, 130),
            replayNote("33333333", 0, 0, 150),
            replayNote("44444444", 0, 0, 400),
          ],
        },
      ],
      { round: 0, player: 0 },
    );
    const clusters = clusterMarkers(markers, 60);
    expect(clusters.length).toBe(2);
    expect(clusters[0]?.markers.length).toBe(3); // 100·130·150
    expect(clusters[0]?.frame).toBe(127); // 평균 반올림
    expect(clusters[1]?.markers.length).toBe(1); // 400
  });

  it("AW-10 간격이 threshold 초과면 분리", () => {
    const markers = collectMarkers(
      [
        {
          clientId: "aaaaaaaaaaaa",
          notes: [replayNote("11111111", 0, 0, 100), replayNote("22222222", 0, 0, 161)],
        },
      ],
      { round: 0, player: 0 },
    );
    expect(clusterMarkers(markers, 60).length).toBe(2);
  });
});

describe("AW-10 마커 타임라인 비율", () => {
  it("AW-10 frame/totalFrames를 [0,1]로 클램프", () => {
    expect(markerRatio(300, 1200)).toBeCloseTo(0.25);
    expect(markerRatio(2000, 1200)).toBe(1);
    expect(markerRatio(100, 0)).toBe(0);
  });
});
