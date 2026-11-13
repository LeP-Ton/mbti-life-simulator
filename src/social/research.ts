import {
  defaultScenario,
  DEFAULT_PARAMETERS,
  parameterBundle,
  SOCIAL_VERSION,
} from "./config";
import { branchWorld, collectMetrics, stepWorld } from "./engine";
import { bounded, mean, quantile, standardError, sum, uniform } from "./math";
import { checkpoint, createWorld } from "./population";
import { sqrt, ln } from "./numeric";
import type {
  ExperimentCell,
  ExperimentReport,
  ExperimentSpec,
  Metrics,
  Parameters,
  PersonalityModel,
  StepResult,
} from "./types";

export interface ExperimentHooks {
  onProgress?: (completed: number, total: number, label: string) => void;
  onCell?: (cell: ExperimentCell) => void | Promise<void>;
  onStep?: (step: StepResult, label: string) => void | Promise<void>;
  shouldCancel?: () => boolean;
  yieldEvery?: number;
}
const COUNTER_KEYS = [
  "publicReports",
  "privateReports",
  "silentReports",
  "validReports",
  "invalidReports",
  "observedOpportunities",
  "defects",
  "fixedDefects",
  "taskAttempts",
  "taskSuccesses",
  "reworkHours",
  "punishmentSquaredError",
  "beliefSamples",
  "separations",
  "hires",
] as const;
function periodMetrics(current: Metrics, start: Metrics): Metrics {
  const copy = { ...current };
  for (const key of COUNTER_KEYS) copy[key] = current[key] - start[key];
  // 分支时尚未结案的机会与缺陷保留在完整快照中，作为处理期的在险存量计入分母。
  copy.observedOpportunities += start.openOpportunities;
  copy.defects += start.openDefects;
  return copy;
}
export const METRIC_VALUES: Record<string, (m: Metrics) => number> = {
  publicRate: (m) =>
    m.observedOpportunities ? m.publicReports / m.observedOpportunities : 0,
  privateRate: (m) =>
    m.observedOpportunities ? m.privateReports / m.observedOpportunities : 0,
  silenceRate: (m) =>
    m.observedOpportunities ? m.silentReports / m.observedOpportunities : 0,
  validReportShare: (m) =>
    m.validReports + m.invalidReports
      ? m.validReports / (m.validReports + m.invalidReports)
      : 0,
  invalidReportShare: (m) =>
    m.validReports + m.invalidReports
      ? m.invalidReports / (m.validReports + m.invalidReports)
      : 0,
  fixRate: (m) => (m.defects ? m.fixedDefects / m.defects : 0),
  beliefError: (m) =>
    m.beliefSamples ? m.punishmentSquaredError / m.beliefSamples : 0,
  employmentRate: (m) => m.employmentRate,
  incomeP50: (m) => m.incomeP50,
  profit: (m) => m.totalProfit,
  reworkHours: (m) => m.reworkHours,
  separations: (m) => m.separations,
  hires: (m) => m.hires,
};
export function summarizeEffects(
  cells: ExperimentCell[],
): ExperimentReport["effects"] {
  const effects: ExperimentReport["effects"] = [];
  for (const horizon of ["year1", "endpoint"] as const)
    for (const model of ["jung8", "big5", "none"] as const)
      for (const learning of [false, true])
        for (const [metric, read] of Object.entries(METRIC_VALUES)) {
          const pairs = cells
            .filter(
              (c) =>
                c.model === model &&
                c.learning === learning &&
                c.punitive === 0.2,
            )
            .map((low) => {
              const high = cells.find(
                (c) =>
                  c.model === model &&
                  c.learning === learning &&
                  c.punitive === 0.8 &&
                  c.replicate === low.replicate,
              );
              const key = horizon === "year1" ? "year1" : "year5";
              return high ? read(high[key]) - read(low[key]) : null;
            })
            .filter((v): v is number => v !== null);
          if (!pairs.length) continue;
          const avg = mean(pairs),
            se = standardError(pairs);
          effects.push({
            horizon,
            model,
            learning,
            metric,
            mean: avg,
            standardError: pairs.length < 2 ? null : se,
            interval95:
              pairs.length < 2 ? null : [avg - 1.96 * se, avg + 1.96 * se],
            n: pairs.length,
          });
        }
  return effects;
}
export async function runExperiment(
  spec: ExperimentSpec,
  hooks: ExperimentHooks = {},
): Promise<ExperimentReport> {
  if (
    !Number.isInteger(spec.seeds) ||
    spec.seeds < 1 ||
    spec.seeds > 1000 ||
    !Number.isInteger(spec.warmupMonths) ||
    spec.warmupMonths < 0 ||
    !Number.isInteger(spec.followupMonths) ||
    spec.followupMonths < 1 ||
    spec.warmupMonths + spec.followupMonths > 1200
  )
    throw new Error("实验重复数和月份必须为有效整数。");
  const models = spec.models ?? ["jung8", "big5", "none"],
    total = spec.seeds * models.length * 4,
    cells: ExperimentCell[] = [];
  const base = { ...structuredClone(DEFAULT_PARAMETERS), ...spec.parameters };
  const advance = async (
    world: ReturnType<typeof createWorld>,
    until: number,
    label: string,
    onMonth?: (m: Metrics) => void,
  ) => {
    while (world.month < until) {
      if (hooks.shouldCancel?.()) throw new Error("实验已取消。");
      const result = stepWorld(world, { captureEvents: !!hooks.onStep });
      onMonth?.(result.metrics);
      await hooks.onStep?.(result, label);
      if (hooks.yieldEvery && world.month % hooks.yieldEvery === 0)
        await new Promise((resolve) => setTimeout(resolve, 0));
    }
  };
  const startReplicate = spec.replicateStart ?? 0;
  for (
    let replicate = startReplicate;
    replicate < startReplicate + spec.seeds;
    replicate++
  )
    for (const model of models) {
      const seed = `${spec.seed}/replicate/${replicate}`,
        world = createWorld(
          defaultScenario({
            seed,
            population: spec.population,
            model,
            parameters: structuredClone(base),
            trackedIds: [],
          }),
        );
      hooks.onProgress?.(
        cells.length,
        total,
        `${model} · 重复 ${replicate + 1} · 预热`,
      );
      await advance(world, spec.warmupMonths, `${model}/${replicate}/warmup`);
      const state = checkpoint(world),
        start = collectMetrics(world);
      for (const punitive of [0.2, 0.8])
        for (const learning of [false, true]) {
          const label = `${model}/${replicate}/${punitive}/${learning}`;
          const branch = branchWorld(state, {
            id: label,
            fromMonth: world.month + 1,
            punitive,
            lockPolicy: true,
            parameters: {
              beliefLearning: learning,
              habitLearning: false,
              institutionLearning: false,
            },
          });
          let year1: Metrics | null = null;
          await advance(
            branch,
            spec.warmupMonths + spec.followupMonths,
            label,
            (m) => {
              if (
                m.month ===
                spec.warmupMonths + Math.min(12, spec.followupMonths)
              )
                year1 = periodMetrics(m, start);
            },
          );
          const year5 = periodMetrics(collectMetrics(branch), start);
          const cell: ExperimentCell = {
            model,
            punitive,
            learning,
            replicate,
            seed,
            year1: year1 ?? year5,
            year5,
          };
          cells.push(cell);
          await hooks.onCell?.(cell);
          hooks.onProgress?.(cells.length, total, label);
        }
    }
  return {
    format: "social-experiment/2",
    ruleVersion: SOCIAL_VERSION,
    calibrated: false,
    label: "合成机制实验 · 未标定",
    spec: structuredClone(spec),
    parameterBundle: parameterBundle(base),
    cells,
    effects: summarizeEffects(cells),
    uncertainty: [
      "区间仅表示配对世界种子的蒙特卡洛误差，使用正态近似；单次重复不能估计区间。",
      "未包含真实参数估计误差；本实验使用未标定的合成假设。",
      "跨人格模型只比较政策效应稳健性，不能解释为现实量表预测准确率。",
      spec.seeds < 30
        ? "当前重复数少于预设三十次，属于流程验证，不能替代正式重复实验。"
        : "各条件已达到初始三十次重复门槛；是否追加应依据预先登记的精度。",
      spec.followupMonths !== 60
        ? `当前跟踪 ${spec.followupMonths} 个月，year5 字段保存实际终点，不是五年结果。`
        : "一年与五年端点均从干预开始计时。",
    ],
  };
}
export const SENSITIVITY_BOUNDS: Record<string, [number, number]> = {
  personalityStrength: [0, 0.5],
  temperature: [0.05, 0.3],
  beliefHalfLifeMonths: [6, 48],
  riskAversion: [0, 0.3],
  habitRate: [0, 0.2],
  assessmentAccuracy: [0.6, 0.98],
};
export function latinHypercube(
  seed: string,
  points = 64,
): Partial<Parameters>[] {
  if (!Number.isInteger(points) || points < 2 || points > 10000)
    throw new Error("拉丁超立方点数必须为 2—10000。");
  const rows: Record<string, number>[] = Array.from(
    { length: points },
    () => ({}),
  );
  for (const [key, [min, max]] of Object.entries(SENSITIVITY_BOUNDS)) {
    const permutation = Array.from({ length: points }, (_, i) => i).sort(
      (a, b) =>
        uniform(seed, 0, `${key}/permutation/${a}`) -
          uniform(seed, 0, `${key}/permutation/${b}`) || a - b,
    );
    rows.forEach((row, i) => {
      row[key] =
        min +
        ((max - min) *
          (permutation[i] + uniform(seed, 0, `${key}/jitter/${i}`))) /
          points;
    });
  }
  return rows;
}
export interface SensitivityReport {
  format: "social-sensitivity/2";
  ruleVersion: string;
  calibrated: false;
  seed: string;
  spec: {
    seed: string;
    population: number;
    months: number;
    points?: number;
    model?: PersonalityModel;
    parameters?: Partial<Parameters>;
  };
  parameterBundle: ReturnType<typeof parameterBundle>;
  points: { parameters: Partial<Parameters>; response: number }[];
  ranking: { parameter: string; correlation: number }[];
  grid: { parameters: Partial<Parameters>; response: number }[];
  method: string;
}
export async function runSensitivity(
  options: {
    seed: string;
    population: number;
    months: number;
    points?: number;
    model?: PersonalityModel;
    parameters?: Partial<Parameters>;
  },
  hooks: ExperimentHooks = {},
): Promise<SensitivityReport> {
  if (
    !Number.isInteger(options.months) ||
    options.months < 1 ||
    options.months > 1200
  )
    throw new Error("敏感性分析的观察月数必须为 1—1200。");
  const rows = latinHypercube(options.seed, options.points ?? 64),
    points: SensitivityReport["points"] = [];
  const evaluate = async (p: Partial<Parameters>) => {
    const world = createWorld(
      defaultScenario({
        seed: options.seed,
        population: options.population,
        model: options.model ?? "jung8",
        parameters: {
          ...structuredClone(DEFAULT_PARAMETERS),
          ...options.parameters,
          ...p,
        },
        trackedIds: [],
      }),
    );
    while (world.month < options.months) {
      if (hooks.shouldCancel?.()) throw new Error("敏感性分析已取消。");
      stepWorld(world, { captureEvents: false });
      if (hooks.yieldEvery && world.month % hooks.yieldEvery === 0)
        await new Promise((resolve) => setTimeout(resolve, 0));
    }
    return METRIC_VALUES.publicRate(collectMetrics(world));
  };
  for (const parameters of rows) {
    points.push({ parameters, response: await evaluate(parameters) });
    hooks.onProgress?.(points.length, rows.length + 25, "拉丁超立方参数筛查");
  }
  const responses = points.map((r) => r.response),
    center = mean(responses);
  const ranking = Object.keys(SENSITIVITY_BOUNDS)
    .map((parameter) => {
      const x = points.map((r) =>
          Number(r.parameters[parameter as keyof Parameters]),
        ),
        mx = mean(x);
      const denom = sqrt(
        sum(x.map((v) => (v - mx) ** 2)) *
          sum(responses.map((v) => (v - center) ** 2)),
      );
      return {
        parameter,
        correlation: denom
          ? sum(x.map((v, i) => (v - mx) * (responses[i] - center))) / denom
          : 0,
      };
    })
    .sort(
      (a, b) =>
        Math.abs(b.correlation) - Math.abs(a.correlation) ||
        a.parameter.localeCompare(b.parameter),
    );
  const grid: SensitivityReport["grid"] = [];
  for (let i = 0; i < 5; i++)
    for (let j = 0; j < 5; j++) {
      const parameters: Record<string, number> = {};
      [i, j].forEach((at, k) => {
        const key = ranking[k].parameter,
          [lo, hi] = SENSITIVITY_BOUNDS[key];
        parameters[key] = lo + ((hi - lo) * at) / 4;
      });
      grid.push({ parameters, response: await evaluate(parameters) });
      hooks.onProgress?.(
        points.length + grid.length,
        rows.length + 25,
        "前两项参数交互网格",
      );
    }
  return {
    format: "social-sensitivity/2",
    ruleVersion: SOCIAL_VERSION,
    calibrated: false,
    seed: options.seed,
    spec: structuredClone(options),
    parameterBundle: parameterBundle({
      ...structuredClone(DEFAULT_PARAMETERS),
      ...options.parameters,
    }),
    points,
    ranking,
    grid,
    method:
      "六维拉丁超立方；绝对 Pearson 相关仅作主效应筛查，不是 Sobol 指数；最高两项五乘五网格；未覆盖其他结构与参数估计不确定性。",
  };
}

export interface PredictionRecord {
  householdId: string;
  month: number;
  outcome: 0 | 1;
  probability: number;
  baselineProbability: number;
  weight: number;
  target: string;
  aligned?: boolean;
}
export function householdSplit(
  id: string,
  seed = "split-2",
): "train" | "validation" | "test" {
  const u = uniform(seed, 0, id);
  return u < 0.7 ? "train" : u < 0.85 ? "validation" : "test";
}
export function evaluatePredictions(
  records: PredictionRecord[],
  options: { seed?: string; futureAfterMonth?: number } = {},
) {
  if (!records.length) throw new Error("缺少验证样本。");
  for (const r of records)
    if (
      !r.householdId ||
      ![0, 1].includes(r.outcome) ||
      !Number.isFinite(r.month) ||
      !Number.isFinite(r.weight) ||
      r.weight <= 0 ||
      ![r.probability, r.baselineProbability].every(
        (p) => Number.isFinite(p) && p >= 0 && p <= 1,
      )
    )
      throw new Error("验证数据包含非法权重、概率或结果。");
  const samples = records.filter(
    (r) =>
      !r.aligned &&
      householdSplit(r.householdId, options.seed) === "test" &&
      (options.futureAfterMonth === undefined ||
        r.month > options.futureAfterMonth),
  );
  if (!samples.length)
    throw new Error("没有独立家庭留出样本；被强制对齐的目标不能用作独立验证。");
  const score = (baseline: boolean) => {
    const total = sum(samples.map((r) => r.weight));
    const brier =
      sum(
        samples.map(
          (r) =>
            r.weight *
            ((baseline ? r.baselineProbability : r.probability) - r.outcome) **
              2,
        ),
      ) / total;
    const logLoss =
      -sum(
        samples.map((r) => {
          const p = bounded(
            baseline ? r.baselineProbability : r.probability,
            1e-12,
            1 - 1e-12,
          );
          return r.weight * (r.outcome * ln(p) + (1 - r.outcome) * ln(1 - p));
        }),
      ) / total;
    let calibrationError = 0;
    for (let bin = 0; bin < 10; bin++) {
      const rows = samples.filter(
          (r) =>
            Math.min(
              9,
              Math.floor(
                (baseline ? r.baselineProbability : r.probability) * 10,
              ),
            ) === bin,
        ),
        w = sum(rows.map((r) => r.weight));
      if (w)
        calibrationError +=
          (w / total) *
          Math.abs(
            sum(
              rows.map(
                (r) =>
                  r.weight * (baseline ? r.baselineProbability : r.probability),
              ),
            ) /
              w -
              sum(rows.map((r) => r.weight * r.outcome)) / w,
          );
    }
    return { brier, logLoss, calibrationError };
  };
  return {
    format: "social-validation/2",
    samples: samples.length,
    households: new Set(samples.map((r) => r.householdId)).size,
    model: score(false),
    baseline: score(true),
    excludedAligned: records.filter((r) => r.aligned).length,
    split: "以家庭固定划分 70/15/15；本结果只使用 test 家庭及指定未来时期",
    scope: "概率评估接口，不自动估计参数；输入数据和预测来源仍需独立审计。",
  };
}
export function distributionComparison(
  simulated: number[],
  observed: number[],
) {
  if (
    !simulated.length ||
    !observed.length ||
    [...simulated, ...observed].some((v) => !Number.isFinite(v))
  )
    throw new Error("分布比较需要非空有限样本。");
  return {
    meanDifference: mean(simulated) - mean(observed),
    quantiles: [0.1, 0.5, 0.9].map((p) => ({
      p,
      simulated: quantile(simulated, p),
      observed: quantile(observed, p),
    })),
    negativeShare: {
      simulated: simulated.filter((v) => v < 0).length / simulated.length,
      observed: observed.filter((v) => v < 0).length / observed.length,
    },
  };
}
