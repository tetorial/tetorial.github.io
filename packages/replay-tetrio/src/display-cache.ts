// displayCache 추출 (meta.json 조립 보조) — 명세 §8.
//
// meta.json은 apps/web이 조립·업로드한다. 여기는 파싱 결과에서 표시 캐시 후보만 뽑는다.
// displayCache는 UI 표시 전용이며 게임 로직 근거로 쓰지 않는다(meta 명세 §3).
import type { MetaFile } from "@tetorial/types";
import type { ReplayDoc } from "./parse.js";

type DisplayCache = NonNullable<MetaFile["displayCache"]>;

/**
 * 리플레이 문서에서 meta.json의 displayCache를 추출한다.
 *
 * - players ← info.users[].username (인덱스 = origin.player와 대응)
 * - playedAt ← info.playedAt / tetrioReplayId ← info.tetrioReplayId (null이면 필드 생략)
 * - roundWinners ← 각 라운드에서 alive === true인 player 인덱스 (없으면 null; ttr은 [null])
 * - formatVersion ← info.formatVersion
 */
export function extractDisplayCache(doc: ReplayDoc): DisplayCache {
  const players = doc.info.users.map((u) => u.username);

  const roundWinners: (number | null)[] = doc.rounds.map((round) => {
    const idx = round.findIndex((entry) => entry.alive === true);
    return idx >= 0 ? idx : null;
  });

  const cache: DisplayCache = {
    players,
    roundWinners,
    formatVersion: doc.info.formatVersion,
  };
  // playedAt·tetrioReplayId는 string 선택 필드 — null이면 생략(로컬 저장본은 id가 null)
  if (doc.info.playedAt !== null) cache.playedAt = doc.info.playedAt;
  if (doc.info.tetrioReplayId !== null) cache.tetrioReplayId = doc.info.tetrioReplayId;

  return cache;
}
