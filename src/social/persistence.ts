import { SOCIAL_VERSION } from "./config";
import { assertWorld } from "./population";
import type { WorldCheckpoint, WorldRun } from "./types";

const DATABASE = "gamex-social-worlds";
export interface RunSummary {
  id: string;
  name: string;
  savedAt: string;
  month: number;
  population: number;
  model: string;
  parentId?: string;
  cursor: number;
}
interface StoredBlob {
  id: string;
  runId: string;
  month?: number;
  compressed: boolean;
  data: Blob;
}
function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("当前环境没有本地档案库。"));
      return;
    }
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore("summaries", { keyPath: "id" });
      request.result.createObjectStore("runs", { keyPath: "id" });
      request.result
        .createObjectStore("checkpoints", { keyPath: "id" })
        .createIndex("runId", "runId");
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(new Error("无法打开本地档案库，请导出 JSON 保留结果。"));
    request.onblocked = () =>
      reject(new Error("档案库升级被其他页面阻塞，请关闭旧页面后重试。"));
  });
}
async function transact<T>(
  name: string,
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(name, mode),
      request = operation(transaction.objectStore(name));
    transaction.oncomplete = () => {
      db.close();
      resolve(request.result);
    };
    transaction.onabort = transaction.onerror = () => {
      db.close();
      reject(
        new Error("档案读写未完成，可能已超出浏览器存储配额，请导出 JSON。"),
      );
    };
  });
}
async function pack(
  value: unknown,
): Promise<Pick<StoredBlob, "data" | "compressed">> {
  const blob = new Blob([JSON.stringify(value)], { type: "application/json" });
  if (typeof CompressionStream === "undefined")
    return { data: blob, compressed: false };
  return {
    data: await new Response(
      blob.stream().pipeThrough(new CompressionStream("gzip")),
    ).blob(),
    compressed: true,
  };
}
async function unpack<T>(stored: StoredBlob): Promise<T> {
  const stream = stored.compressed
    ? stored.data.stream().pipeThrough(new DecompressionStream("gzip"))
    : stored.data.stream();
  return JSON.parse(await new Response(stream).text()) as T;
}
// 压缩在事务之前完成，避免异步压缩让 IndexedDB 事务提前关闭。
export async function saveCheckpoint(state: WorldCheckpoint, runId: string) {
  const payload = await pack(state);
  await transact("checkpoints", "readwrite", (store) =>
    store.put({
      id: `${runId}/${state.month}`,
      runId,
      month: state.month,
      ...payload,
    }),
  );
}
export async function loadCheckpoint(
  runId: string,
  month: number,
): Promise<WorldCheckpoint | null> {
  const stored = await transact<StoredBlob | undefined>(
    "checkpoints",
    "readonly",
    (store) => store.get(`${runId}/${month}`),
  );
  if (!stored) return null;
  const checkpoint = await unpack<WorldCheckpoint>(stored);
  assertWorld(checkpoint.world);
  return checkpoint;
}
export async function saveWorldRun(run: WorldRun, cursor = 0) {
  const payload = await pack(run);
  await transact("runs", "readwrite", (store) =>
    store.put({ id: run.id, runId: run.id, ...payload }),
  );
  const summary: RunSummary = {
    id: run.id,
    name: run.name,
    savedAt: new Date().toISOString(),
    month: run.finalWorld.month,
    population: run.config.population,
    model: run.config.model,
    parentId: run.parent?.runId,
    cursor,
  };
  await transact("summaries", "readwrite", (store) => store.put(summary));
}
export async function listWorldRuns(): Promise<RunSummary[]> {
  const summaries = await transact<RunSummary[]>(
    "summaries",
    "readonly",
    (store) => store.getAll(),
  );
  return summaries.sort((a, b) => b.savedAt.localeCompare(a.savedAt));
}
export async function loadWorldRun(id: string): Promise<WorldRun | null> {
  const record = await transact<StoredBlob | undefined>(
    "runs",
    "readonly",
    (store) => store.get(id),
  );
  return record ? validateArchive(await unpack<unknown>(record)) : null;
}
export async function deleteWorldRun(id: string) {
  await transact("summaries", "readwrite", (store) => store.delete(id));
  await transact("runs", "readwrite", (store) => store.delete(id));
  const db = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction("checkpoints", "readwrite"),
      store = tx.objectStore("checkpoints"),
      cursor = store.index("runId").openKeyCursor(IDBKeyRange.only(id));
    cursor.onsuccess = () => {
      const entry = cursor.result;
      if (entry) {
        store.delete(entry.primaryKey);
        entry.continue();
      }
    };
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onabort = tx.onerror = () => {
      db.close();
      reject(new Error("检查点清理失败。"));
    };
  });
}
export function validateArchive(value: unknown): WorldRun {
  const candidate = (value as { run?: unknown })?.run ?? value;
  if (!candidate || typeof candidate !== "object")
    throw new Error("不是社会模拟档案。");
  const run = candidate as WorldRun;
  if (
    run.schemaVersion !== 2 ||
    run.ruleVersion !== SOCIAL_VERSION ||
    run.calibrated !== false ||
    !run.config ||
    !run.finalWorld ||
    !Array.isArray(run.metrics) ||
    !Array.isArray(run.events) ||
    !Array.isArray(run.ledger)
  )
    throw new Error("档案版本不兼容；V1 人生只能作为只读档案查看。");
  assertWorld(run.finalWorld);
  if (
    run.config.trackedIds.length > 16 ||
    run.finalWorld.month !== run.config.months ||
    run.metrics.length !== run.config.months + 1
  )
    throw new Error("档案轨迹或月份不完整。");
  return run;
}
