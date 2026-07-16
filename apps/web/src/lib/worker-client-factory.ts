// Worker 클라이언트 싱글턴 — PUBLIC_WORKER_URL 기반(conventions §7). 미설정 시 throw(호출자가
// 저장·공유 비활성 안내). rawUrl 손조립 금지 규약은 WorkerClient가 강제한다.
import { WorkerClient } from "./worker-client.js";

let cached: WorkerClient | null = null;

export function getWorkerClient(): WorkerClient {
  if (cached === null) cached = new WorkerClient();
  return cached;
}

/** PUBLIC_WORKER_URL이 설정돼 저장·공유가 가능한지. */
export function isWorkerConfigured(): boolean {
  try {
    getWorkerClient();
    return true;
  } catch {
    return false;
  }
}
