import { hash } from "../simulation/random";
import { SOCIAL_VERSION } from "./config";
import { branchWorld, collectMetrics, stepWorld } from "./engine";
import { cash } from "./ledger";
import { checkpoint, createWorld } from "./population";
import type {
  Id,
  Intervention,
  LifeView,
  PersonFrame,
  ScenarioConfig,
  StepResult,
  World,
  WorldCheckpoint,
  WorldRun,
} from "./types";

export interface RunHooks {
  onCheckpoint?: (
    value: WorldCheckpoint,
    runId: string,
  ) => void | Promise<void>;
  onStep?: (result: StepResult) => void | Promise<void>;
  onProgress?: (month: number, total: number) => void;
  shouldCancel?: () => boolean;
  yieldEvery?: number;
  checkInvariants?: boolean;
}
export function runId(
  config: ScenarioConfig,
  parent?: { id: string; month: number; intervention: Intervention },
) {
  const stable = {
    version: SOCIAL_VERSION,
    seed: config.seed,
    population: config.population,
    model: config.model,
    parameters: Object.entries(config.parameters).sort(([a], [b]) =>
      a.localeCompare(b),
    ),
    trackedIds: [...config.trackedIds].sort(),
    months: config.months,
    focalName: config.focalName,
    focal: config.focal ?? null,
    macro: config.macroSeries ?? [],
    external: config.exogenousEvents ?? [],
    parent: parent ?? null,
  };
  return `world-${hash(JSON.stringify(stable)).toString(36)}`;
}
export function captureFrame(world: World, id: Id): PersonFrame | null {
  const source = world.persons[id];
  if (!source) return null;
  // 观察投影不携带规划缓存；完整可续跑状态只在世界检查点中保存。
  const person = structuredClone({
    ...source,
    memory: {
      ...source.memory,
      recent: source.memory.recent.slice(-4),
      quarter: [],
      annual: [],
      revisions: source.memory.revisions.slice(-3),
    },
  });
  const position = source.employment.positionId
    ? world.positions[source.employment.positionId]
    : null;
  const debt = Object.values(world.claims)
    .filter((c) => c.debtorAccountId === source.cashAccountId)
    .reduce((s, c) => s + c.amount, 0);
  return {
    month: world.month,
    person,
    cash: cash(world, source.cashAccountId),
    householdCash: cash(world, world.households[source.householdId].accountId),
    firmName: position ? world.firms[position.firmId].name : null,
    jobGrade: position?.grade ?? null,
    debt,
  };
}
async function advance(run: WorldRun, hooks: RunHooks) {
  const tracked = new Set(run.config.trackedIds),
    world = run.finalWorld;
  const capture = () => {
    for (const id of tracked) {
      const frame = captureFrame(world, id);
      if (frame) (run.frames[id] ??= []).push(frame);
    }
  };
  if (!run.metrics.length) {
    run.metrics.push(collectMetrics(world));
    capture();
    run.checkpointMonths.push(world.month);
    await hooks.onCheckpoint?.(checkpoint(world), run.id);
  }
  while (world.month < run.config.months) {
    if (hooks.shouldCancel?.()) throw new Error("模拟已取消，已有存档未修改。");
    const result = stepWorld(world, { checkInvariants: hooks.checkInvariants });
    run.metrics.push(result.metrics);
    capture();
    run.events.push(
      ...result.events.filter(
        (e) =>
          e.actorIds.some((id) => tracked.has(id)) ||
          ["intervention", "closure", "investment"].includes(e.kind),
      ),
    );
    const accounts = new Set(
      [...tracked]
        .map((id) => world.persons[id]?.cashAccountId)
        .filter(Boolean),
    );
    for (const id of tracked) {
      const p = world.persons[id];
      if (p) accounts.add(world.households[p.householdId].accountId);
    }
    run.ledger.push(
      ...result.ledger.filter(
        (e) => accounts.has(e.from) || accounts.has(e.to),
      ),
    );
    await hooks.onStep?.(result);
    if (world.month % 12 === 0 || world.month === run.config.months) {
      run.checkpointMonths.push(world.month);
      await hooks.onCheckpoint?.(checkpoint(world), run.id);
    }
    hooks.onProgress?.(world.month, run.config.months);
    if (hooks.yieldEvery && world.month % hooks.yieldEvery === 0)
      await new Promise((resolve) => setTimeout(resolve, 0));
  }
  return run;
}
export async function runWorld(
  config: ScenarioConfig,
  hooks: RunHooks = {},
): Promise<WorldRun> {
  const world = createWorld(config);
  for (const id of config.trackedIds)
    if (!world.persons[id]) throw new Error(`观察人物不存在：${id}`);
  const run: WorldRun = {
    id: runId(config),
    name: `${config.focalName}的共享社会`,
    config: structuredClone(config),
    schemaVersion: 2,
    ruleVersion: SOCIAL_VERSION,
    calibrated: false,
    metrics: [],
    frames: {},
    events: [],
    ledger: [],
    checkpointMonths: [],
    finalWorld: world,
  };
  return advance(run, hooks);
}
export async function runBranch(
  parent: WorldRun,
  state: WorldCheckpoint,
  month: number,
  intervention: Intervention,
  hooks: RunHooks = {},
): Promise<WorldRun> {
  if (
    !Number.isInteger(month) ||
    month < state.month ||
    month >= parent.config.months
  )
    throw new Error("分支月份须位于快照与观察终点之间。");
  const reconstructed = structuredClone(state.world);
  while (reconstructed.month < month) stepWorld(reconstructed);
  const world = branchWorld(checkpoint(reconstructed), intervention),
    config = structuredClone(parent.config);
  const run: WorldRun = {
    ...parent,
    id: runId(config, { id: parent.id, month, intervention }),
    name: `${parent.name} · ${intervention.id}`,
    config,
    metrics: structuredClone(parent.metrics.filter((m) => m.month <= month)),
    frames: Object.fromEntries(
      Object.entries(parent.frames).map(([id, frames]) => [
        id,
        structuredClone(frames.filter((f) => f.month <= month)),
      ]),
    ),
    events: structuredClone(parent.events.filter((e) => e.month <= month)),
    ledger: structuredClone(parent.ledger.filter((e) => e.month <= month)),
    checkpointMonths: parent.checkpointMonths.filter((m) => m <= month),
    finalWorld: world,
    parent: {
      runId: parent.id,
      month,
      intervention: structuredClone(intervention),
    },
  };
  if (!run.checkpointMonths.includes(month)) run.checkpointMonths.push(month);
  await hooks.onCheckpoint?.(checkpoint(world), run.id);
  return advance(run, hooks);
}
export function projectLife(
  run: WorldRun,
  personId: Id,
  cursorMonth: number,
): LifeView {
  const frames = run.frames[personId] ?? [];
  return {
    personId,
    frame: frames.find((f) => f.month === cursorMonth) ?? null,
    events: run.events.filter(
      (e) => e.month <= cursorMonth && e.actorIds.includes(personId),
    ),
    months: frames.map((f) => f.month),
  };
}
export function selectCheckpointMonth(months: number[], cursor: number) {
  const selected = months.filter((m) => m <= cursor).sort((a, b) => b - a)[0];
  if (selected === undefined)
    throw new Error("缺少该月份之前的完整世界检查点。");
  return selected;
}
