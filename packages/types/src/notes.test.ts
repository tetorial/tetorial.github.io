import { describe, expect, it } from "vitest";
import type { z } from "zod";
import { notesFileSchema, type NotesFile, type Note } from "./index.js";

// docs/specs/notes-schema.md §5 전체 예시 — 자구 그대로 (수정 금지)
const specExampleJson = `{
  "schema": "tetorial.notes/1",
  "clientId": "k3XmP9qLwR2v",
  "editKeyHash": "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08",
  "author": { "name": "corun" },
  "createdAt": "2026-07-10T04:12:00Z",
  "updatedAt": "2026-07-10T04:31:07Z",
  "notes": [
    {
      "id": "aB3dE5fG",
      "origin": { "type": "replay", "round": 1, "player": 0, "frame": 841 },
      "snapshot": {
        "ruleset": { "preset": "srs+", "spinBonuses": "all-mini+" },
        "board": { "width": 10, "rows": ["JJJGGGGGG_", "J_SSGGGGG_", "__SS______"] },
        "current": "T",
        "hold": "I",
        "holdLocked": false,
        "queue": "LOSZJITSZL",
        "counters": { "b2b": 2, "combo": 0 }
      },
      "pages": [
        {
          "id": "p1Q2w3E4",
          "state": {
            "board": { "width": 10, "rows": ["J_SSGGGGG_", "__SS______"] },
            "current": "L", "hold": "I", "holdLocked": false,
            "queueUsed": 1,
            "counters": { "b2b": 3, "combo": 1 }
          },
          "comment": "여기서 TSD가 가능했음. 좌측 단차를 먼저 보세요"
        },
        {
          "id": "r5T6y7U8",
          "state": {
            "board": { "width": 10, "rows": ["GJ_SSGGGGG", "___SS____G"] },
            "current": "L", "hold": "I", "holdLocked": false,
            "queueUsed": 1,
            "counters": { "b2b": 3, "combo": 1 }
          },
          "comment": "만약 쓰레기가 우측에 한 줄 더 왔다면 이렇게 됐을 것 (셀 그리기)"
        }
      ],
      "createdAt": "2026-07-10T04:12:00Z",
      "updatedAt": "2026-07-10T04:31:07Z"
    }
  ]
}`;

/** 명세 예시를 기반으로 한 유효 파일 (경계 테스트의 출발점) */
function validFile(): NotesFile {
  return notesFileSchema.parse(JSON.parse(specExampleJson));
}

/** validFile을 복제해 mutate를 적용한 뒤 통과 여부를 검사 */
function checkMutated(mutate: (file: NotesFile) => void): boolean {
  const file = structuredClone(validFile());
  mutate(file);
  return notesFileSchema.safeParse(file).success;
}

function firstNote(file: NotesFile): Note {
  const note = file.notes[0];
  if (!note) throw new Error("예시 파일에 노트가 없다");
  return note;
}

// 타입 레벨 검증: 손 선언 타입(명세 §4 자구)과 zod 추론 타입의 상호 할당성
type MutualExtends<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
const notesTypeMatches: MutualExtends<NotesFile, z.infer<typeof notesFileSchema>> = true;

describe("W0b-1 명세 예시 JSON 왕복 (notes-schema §5)", () => {
  it("예시 JSON이 그대로 파싱 통과한다", () => {
    const result = notesFileSchema.safeParse(JSON.parse(specExampleJson));
    expect(result.success).toBe(true);
  });

  it("파싱 결과가 입력과 deep-equal (왕복 무손실)", () => {
    const input: unknown = JSON.parse(specExampleJson);
    expect(notesFileSchema.parse(input)).toEqual(input);
  });

  it("TS 타입과 zod 추론 타입이 상호 할당 가능하다", () => {
    expect(notesTypeMatches).toBe(true);
  });
});

describe("W0b-2 한도 경계 매트릭스 (notes-schema §4·§6)", () => {
  it("notes 50개 통과 / 51개 거부", () => {
    const grow = (n: number) => (file: NotesFile) => {
      const proto = firstNote(file);
      file.notes = Array.from({ length: n }, (_, i) => ({
        ...structuredClone(proto),
        id: `n${String(i).padStart(7, "0")}`,
      }));
    };
    expect(checkMutated(grow(50))).toBe(true);
    expect(checkMutated(grow(51))).toBe(false);
  });

  it("pages 100개 통과 / 101개 거부 / 0개 거부 (최소 1개)", () => {
    const grow = (n: number) => (file: NotesFile) => {
      const note = firstNote(file);
      const proto = structuredClone(note.pages[0]);
      if (!proto) throw new Error("예시에 페이지가 없다");
      note.pages = Array.from({ length: n }, (_, i) => ({
        ...structuredClone(proto),
        id: `p${String(i).padStart(7, "0")}`,
      }));
    };
    expect(checkMutated(grow(100))).toBe(true);
    expect(checkMutated(grow(101))).toBe(false);
    expect(checkMutated(grow(0))).toBe(false);
  });

  it("comment 500 코드포인트 통과 / 501 거부 (아스트랄 문자로 코드포인트 기준 검증)", () => {
    // "😀"는 1 코드포인트 = UTF-16 2단위. .length 기준이었다면 500개(길이 1000)가 거부됐을 것
    const setComment = (s: string) => (file: NotesFile) => {
      const page = firstNote(file).pages[0];
      if (!page) throw new Error("예시에 페이지가 없다");
      page.comment = s;
    };
    expect(checkMutated(setComment("😀".repeat(500)))).toBe(true);
    expect(checkMutated(setComment("😀".repeat(501)))).toBe(false);
  });

  it("queue 1000자 통과 / 1001자 거부 / 미노 외 문자 거부 / 빈 문자열 통과", () => {
    const setQueue = (q: string) => (file: NotesFile) => {
      const note = firstNote(file);
      note.snapshot.queue = q;
      for (const p of note.pages) p.state.queueUsed = 0;
    };
    expect(checkMutated(setQueue("IJLOSTZ".repeat(142).concat("IJLOST")))).toBe(true); // 1000
    expect(checkMutated(setQueue("I".repeat(1001)))).toBe(false);
    expect(checkMutated(setQueue("IJLX"))).toBe(false);
    expect(checkMutated(setQueue(""))).toBe(true);
  });

  it("board rows 40행 통과 / 41행 거부", () => {
    const setRows = (n: number) => (file: NotesFile) => {
      firstNote(file).snapshot.board.rows = Array.from({ length: n }, () => "G".repeat(10));
    };
    expect(checkMutated(setRows(40))).toBe(true);
    expect(checkMutated(setRows(41))).toBe(false);
  });

  it("행 길이 ≠ width(10) 거부 / 허용 외 문자 거부 / width ≠ 10 거부", () => {
    const setRow = (row: string) => (file: NotesFile) => {
      firstNote(file).snapshot.board.rows = [row];
    };
    expect(checkMutated(setRow("_".repeat(9)))).toBe(false);
    expect(checkMutated(setRow("_".repeat(11)))).toBe(false);
    expect(checkMutated(setRow("X".repeat(10)))).toBe(false);
    expect(
      checkMutated((file) => {
        // width 리터럴 10 위반
        (firstNote(file).snapshot.board as { width: number }).width = 9;
      }),
    ).toBe(false);
  });

  it("queueUsed == queue 길이 통과 / +1 거부 / 음수 거부 (산술 경계 refine)", () => {
    const setUsed = (n: number) => (file: NotesFile) => {
      const page = firstNote(file).pages[0];
      if (!page) throw new Error("예시에 페이지가 없다");
      page.state.queueUsed = n;
    };
    const queueLen = firstNote(validFile()).snapshot.queue.length; // 10
    expect(checkMutated(setUsed(queueLen))).toBe(true);
    expect(checkMutated(setUsed(queueLen + 1))).toBe(false);
    expect(checkMutated(setUsed(-1))).toBe(false);
  });

  it("counters -1 통과 (tetr.io 원값 규약 D-9) / -2 거부 / 소수 거부", () => {
    const setB2b = (n: number) => (file: NotesFile) => {
      firstNote(file).snapshot.counters.b2b = n;
    };
    expect(checkMutated(setB2b(-1))).toBe(true);
    expect(checkMutated(setB2b(-2))).toBe(false);
    expect(checkMutated(setB2b(1.5))).toBe(false);
  });

  it("clientId 12자만 통과 / editKeyHash hex 64자만 통과", () => {
    expect(checkMutated((f) => void (f.clientId = "a".repeat(11)))).toBe(false);
    expect(checkMutated((f) => void (f.clientId = "a".repeat(13)))).toBe(false);
    expect(checkMutated((f) => void (f.clientId = "한글은안된다12"))).toBe(false);
    expect(checkMutated((f) => void (f.editKeyHash = "9f".repeat(31) + "9"))).toBe(false); // 63자
    expect(checkMutated((f) => void (f.editKeyHash = "9f".repeat(32) + "9f"))).toBe(false); // 66자
    expect(checkMutated((f) => void (f.editKeyHash = "9F".repeat(32)))).toBe(false); // 대문자
    expect(checkMutated((f) => void (f.editKeyHash = "zz".repeat(32)))).toBe(false); // 비hex
  });

  it("id는 [A-Za-z0-9_-]{8} / note.id 파일 내 유일 / page.id 노트 내 유일", () => {
    expect(checkMutated((f) => void (firstNote(f).id = "7자리아이디"))).toBe(false);
    expect(
      checkMutated((f) => {
        f.notes = [firstNote(f), structuredClone(firstNote(f))]; // id 중복
      }),
    ).toBe(false);
    expect(
      checkMutated((f) => {
        const note = firstNote(f);
        const page = note.pages[0];
        if (!page) throw new Error("예시에 페이지가 없다");
        note.pages = [page, structuredClone(page)]; // id 중복
      }),
    ).toBe(false);
  });

  it("일시는 ISO 8601 UTC(Z)만 통과", () => {
    expect(checkMutated((f) => void (f.createdAt = "2026-07-10T04:12:00"))).toBe(false);
    expect(checkMutated((f) => void (f.createdAt = "2026-07-10T04:12:00+09:00"))).toBe(false);
    expect(checkMutated((f) => void (f.createdAt = "어제"))).toBe(false);
  });

  it("origin 판별 유니온: 미지의 type 거부 / 음수 frame 거부 / note 참조 형식 검증", () => {
    expect(
      checkMutated((f) => {
        (firstNote(f) as { origin: unknown }).origin = { type: "fumen", page: 1 };
      }),
    ).toBe(false);
    expect(
      checkMutated((f) => {
        firstNote(f).origin = { type: "replay", round: 0, player: 0, frame: -1 };
      }),
    ).toBe(false);
    expect(
      checkMutated((f) => {
        firstNote(f).origin = {
          type: "note",
          clientId: "k3XmP9qLwR2v",
          noteId: "aB3dE5fG",
          pageId: "p1Q2w3E4",
        };
      }),
    ).toBe(true);
    expect(
      checkMutated((f) => {
        firstNote(f).origin = {
          type: "note",
          clientId: "짧다",
          noteId: "aB3dE5fG",
          pageId: "p1Q2w3E4",
        };
      }),
    ).toBe(false);
  });

  it("snapshot.current는 null 불가, page.state.current는 null 허용 (큐 소진)", () => {
    expect(
      checkMutated((f) => {
        (firstNote(f).snapshot as { current: unknown }).current = null;
      }),
    ).toBe(false);
    expect(
      checkMutated((f) => {
        const page = firstNote(f).pages[0];
        if (!page) throw new Error("예시에 페이지가 없다");
        page.state.current = null;
      }),
    ).toBe(true);
  });

  it("ruleset.preset은 srs | srs+만", () => {
    expect(
      checkMutated((f) => {
        (firstNote(f).snapshot.ruleset as { preset: string }).preset = "ars";
      }),
    ).toBe(false);
  });
});

describe("W0b-3 v1 예약 요소 — D 셀·overlays (notes-schema 결정 로그 5)", () => {
  it('"D"(더미 블록) 셀이 포함된 행이 통과한다', () => {
    expect(
      checkMutated((f) => {
        firstNote(f).snapshot.board.rows = ["DDGG______", "__DD______"];
      }),
    ).toBe(true);
  });

  it("overlays.highlights가 통과한다 (_/H 인코딩, 행 길이 = width)", () => {
    const setHighlights = (rows: string[]) => (file: NotesFile) => {
      const page = firstNote(file).pages[0];
      if (!page) throw new Error("예시에 페이지가 없다");
      page.state.overlays = { highlights: rows };
    };
    expect(checkMutated(setHighlights(["HH________", "____HHHH__"]))).toBe(true);
    expect(checkMutated(setHighlights([]))).toBe(true);
    expect(checkMutated(setHighlights(["H_"]))).toBe(false); // 행 길이 위반
    expect(checkMutated(setHighlights(["HX________"]))).toBe(false); // 허용 외 문자
    expect(checkMutated(setHighlights(Array.from({ length: 41 }, () => "H".repeat(10))))).toBe(
      false,
    ); // 40행 초과
  });
});
