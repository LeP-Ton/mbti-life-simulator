import {
  DEFAULT_PARAMETERS,
  defaultScenario,
  parameterBundle,
  SOCIAL_VERSION,
} from "./config";
import { branchWorld, collectMetrics, stepWorld } from "./engine";
import { checkpoint, createWorld } from "./population";
import type { ExperimentHooks } from "./research";
import type { Metrics, Parameters, PersonalityModel } from "./types";

export interface StructureSpec {
  seed: string;
  population: number;
  seeds: number;
  warmupMonths: number;
  months: number;
  model?: PersonalityModel;
  parameters?: Partial<Parameters>;
}
export interface StructureReport {
  format: "social-structure/2";
  ruleVersion: string;
  calibrated: false;
  spec: StructureSpec;
  parameterBundle: ReturnType<typeof parameterBundle>;
  cells: {
    replicate: number;
    seed: string;
    condition: string;
    metrics: Metrics;
    meanTraitDrift: number;
  }[];
  scope: string;
}
export async function runStructuralAblation(
  spec: StructureSpec,
  hooks: ExperimentHooks = {},
): Promise<StructureReport> {
  if (
    !Number.isInteger(spec.seeds) ||
    spec.seeds < 1 ||
    !Number.isInteger(spec.months) ||
    spec.months < 1 ||
    !Number.isInteger(spec.warmupMonths) ||
    spec.warmupMonths < 0 ||
    spec.warmupMonths + spec.months > 1200 ||
    spec.seeds > 1000
  )
    throw new Error("结构对照的重复数和月份非法。");
  const base = {
    ...structuredClone(DEFAULT_PARAMETERS),
    ...spec.parameters,
    beliefLearning: false,
    habitLearning: false,
    institutionLearning: false,
    plasticity: false,
  };
  const cells: StructureReport["cells"] = [],
    conditions = [
      {
        name: "固定画像与策略",
        beliefLearning: false,
        habitLearning: false,
        plasticity: false,
      },
      {
        name: "仅信念学习",
        beliefLearning: true,
        habitLearning: false,
        plasticity: false,
      },
      {
        name: "信念加策略学习",
        beliefLearning: true,
        habitLearning: true,
        plasticity: false,
      },
      {
        name: "启用人格可塑性",
        beliefLearning: true,
        habitLearning: true,
        plasticity: true,
      },
    ];
  const advance = async (
    world: ReturnType<typeof createWorld>,
    end: number,
    label: string,
  ) => {
    while (world.month < end) {
      if (hooks.shouldCancel?.()) throw new Error("结构对照已取消。");
      const result = stepWorld(world, { captureEvents: !!hooks.onStep });
      await hooks.onStep?.(result, label);
      if (hooks.yieldEvery)
        await new Promise((resolve) => setTimeout(resolve, 0));
    }
  };
  for (let replicate = 0; replicate < spec.seeds; replicate++) {
    const seed = `${spec.seed}/structure/${replicate}`,
      world = createWorld(
        defaultScenario({
          seed,
          population: spec.population,
          model: spec.model ?? "jung8",
          parameters: base,
          trackedIds: [],
        }),
      );
    await advance(world, spec.warmupMonths, `${replicate}/warmup`);
    const state = checkpoint(world);
    for (const condition of conditions) {
      const { name, ...parameters } = condition,
        branch = branchWorld(state, {
          id: name,
          fromMonth: world.month + 1,
          parameters,
        });
      await advance(
        branch,
        spec.warmupMonths + spec.months,
        `${replicate}/${name}`,
      );
      const drift = Object.values(branch.persons).map((p) => {
        const raw =
            spec.model === "big5"
              ? p.profiles.effectiveBig5
              : p.profiles.effectiveJung8,
          initial =
            spec.model === "big5"
              ? p.profiles.initialBig5
              : p.profiles.initialJung8,
          scale = spec.model === "big5" ? 1 : 100;
        return (
          Object.keys(raw).reduce(
            (s, k) =>
              s +
              Math.abs(
                raw[k as keyof typeof raw] - initial[k as keyof typeof initial],
              ) /
                scale,
            0,
          ) / Object.keys(raw).length
        );
      });
      cells.push({
        replicate,
        seed,
        condition: name,
        metrics: collectMetrics(branch),
        meanTraitDrift:
          drift.reduce((s, v) => s + v, 0) / Math.max(1, drift.length),
      });
      hooks.onProgress?.(
        cells.length,
        spec.seeds * 4,
        `${replicate + 1} · ${name}`,
      );
    }
  }
  return {
    format: "social-structure/2",
    ruleVersion: SOCIAL_VERSION,
    calibrated: false,
    spec: structuredClone(spec),
    parameterBundle: parameterBundle(base),
    cells,
    scope:
      "四种结构从同一完整社会快照分支；机构学习全部关闭。人格漂移受证据门槛约束，零漂移不代表模块失败。结构差异与参数、世界随机性分别报告，不能解释为现实人格可塑性的证据。",
  };
}
