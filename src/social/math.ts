import { random } from "../simulation/random";
import { exp, ln, cos, pow, sqrt } from "./numeric";
import type { BetaBelief, Emotion, Hours, Vector6 } from "./types";

export const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
export const bounded = (x: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, x));
export const sigmoid = (x: number) => 1 / (1 + exp(-bounded(x, -40, 40)));
export const logit = (p: number) =>
  ln(bounded(p, 1e-8, 1 - 1e-8) / (1 - bounded(p, 1e-8, 1 - 1e-8)));
export const dot = (a: readonly number[], b: readonly number[]) =>
  a.reduce((s, v, i) => s + v * b[i], 0);
export const sum = (a: readonly number[]) => a.reduce((s, v) => s + v, 0);
export const mean = (a: readonly number[]) =>
  a.length ? sum(a) / a.length : 0;
export const quantile = (values: readonly number[], p: number) => {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b),
    at = (sorted.length - 1) * p,
    low = Math.floor(at);
  return sorted[low] + (sorted[Math.ceil(at)] - sorted[low]) * (at - low);
};
export const annualToMonthly = (p: number) =>
  1 - pow(1 - bounded(p, 0, 1), 1 / 12);
export const uniform = (seed: string, month: number, key: string) =>
  random(seed, month, key) + 2 ** -33;
export const normal = (seed: string, month: number, key: string) =>
  sqrt(-2 * ln(uniform(seed, month, `${key}:0`))) *
  cos(2 * Math.PI * uniform(seed, month, `${key}:1`));
export const beta22 = (seed: string, key: string) => {
  const a = -ln(uniform(seed, 0, `${key}:0`) * uniform(seed, 0, `${key}:1`));
  const b = -ln(uniform(seed, 0, `${key}:2`) * uniform(seed, 0, `${key}:3`));
  return a / (a + b);
};
export function softmax(values: readonly number[]): number[] {
  if (!values.length) return [];
  const top = Math.max(...values),
    weights = values.map((v) => exp(v - top)),
    total = sum(weights);
  return weights.map((v) => v / total);
}
export function sampleIndex(
  probabilities: readonly number[],
  draw: number,
): number {
  let cumulative = 0;
  for (let i = 0; i < probabilities.length; i++) {
    cumulative += probabilities[i];
    if (draw < cumulative) return i;
  }
  return probabilities.length - 1;
}
export const newBelief = (tick = 0): BetaBelief => ({
  alpha: 2,
  beta: 2,
  lastUpdatedTick: tick,
  lastEvidenceSequence: -1,
});
export const betaMean = (b?: BetaBelief) =>
  b ? b.alpha / (b.alpha + b.beta) : 0.5;
export const betaVariance = (b: BetaBelief) =>
  (b.alpha * b.beta) / ((b.alpha + b.beta) ** 2 * (b.alpha + b.beta + 1));
export function informationGain(b: BetaBelief): number {
  const p = betaMean(b),
    v = betaVariance(b);
  return v
    ? clamp01(
        1 -
          (p * betaVariance({ ...b, alpha: b.alpha + 1 }) +
            (1 - p) * betaVariance({ ...b, beta: b.beta + 1 })) /
            v,
      )
    : 0;
}
// 证据序号来自单调事件流，旧事件的转述不能再次计数。
export function updateBeta(
  b: BetaBelief,
  outcome: boolean,
  tick: number,
  sequence: number,
  halfLifeMonths = 24,
): BetaBelief {
  if (sequence <= b.lastEvidenceSequence) return b;
  const decay =
    halfLifeMonths === Infinity
      ? 1
      : pow(2, -Math.max(0, tick - b.lastUpdatedTick) / 4 / halfLifeMonths);
  return {
    alpha: 2 + decay * (b.alpha - 2) + Number(outcome),
    beta: 2 + decay * (b.beta - 2) + Number(!outcome),
    lastUpdatedTick: tick,
    lastEvidenceSequence: sequence,
  };
}
export const emptyHours = (): Hours => ({
  course: 0,
  work: 0,
  study: 0,
  practice: 0,
  search: 0,
  connection: 0,
  rest: 0,
  care: 0,
});
export const totalHours = (h: Hours) => sum(Object.values(h));
export const roundHours = (x: number) => Math.floor(Math.max(0, x) * 2) / 2;
export function addHours(target: Hours, addition: Hours) {
  for (const key of Object.keys(target) as (keyof Hours)[])
    target[key] += addition[key];
}
export const emptyEmotions = (): Record<Emotion, number> => ({
  joy: 0,
  distress: 0,
  fear: 0,
  anger: 0,
  gratitude: 0,
  pride: 0,
  shame: 0,
});
export function updateEmotions(
  current: Record<Emotion, number>,
  appraisal: {
    desirability: number;
    norm: number;
    self: number;
    other: number;
    likelihood: number;
    severity: number;
  },
  days: number,
  halfLife = 7.5,
  impulse = 0.6,
) {
  const d = appraisal.desirability,
    n = appraisal.norm;
  const positive = Math.max(0, d),
    negative = Math.max(0, -d);
  const praise = Math.max(0, n),
    blame = Math.max(0, -n);
  const triggers: Record<Emotion, number> = {
    joy: positive,
    distress: negative,
    fear: appraisal.likelihood * appraisal.severity,
    anger: negative * blame * appraisal.other,
    gratitude: positive * praise * appraisal.other,
    pride: positive * praise * appraisal.self,
    shame: negative * blame * appraisal.self,
  };
  return Object.fromEntries(
    Object.entries(current).map(([key, value]) => [
      key,
      clamp01(
        1 -
          (1 - value * pow(2, -days / halfLife)) *
            (1 - impulse * triggers[key as Emotion]),
      ),
    ]),
  ) as Record<Emotion, number>;
}
export function taskQuality(evidence: {
  knowledge: number;
  practice: number;
  energy: number;
  hours: number;
  requiredHours: number;
  disturbance: number;
}) {
  return clamp01(
    (0.4 * evidence.knowledge + 0.6 * evidence.practice) *
      (0.6 + 0.4 * evidence.energy) *
      sqrt(
        Math.min(evidence.hours / Math.max(0.5, evidence.requiredHours), 1),
      ) +
      0.04 * evidence.disturbance,
  );
}
export function standardError(values: number[]) {
  if (values.length < 2) return 0;
  const avg = mean(values);
  return sqrt(
    values.reduce((a, v) => a + (v - avg) ** 2, 0) /
      (values.length - 1) /
      values.length,
  );
}
export function teamQuality(
  members: {
    knowledge: Record<string, number>;
    practice: Record<string, number>;
    energy: number;
  }[],
  requirements: Record<string, number>,
  coordinationHours: number,
) {
  if (!members.length) return 0;
  const coverage = Object.entries(requirements).reduce(
    (s, [d, r]) =>
      s +
      r *
        (0.4 * mean(members.map((p) => p.knowledge[d] ?? 0)) +
          0.6 * Math.max(...members.map((p) => p.practice[d] ?? 0))),
    0,
  );
  return (
    clamp01(
      coverage - (0.1 * (members.length - 1)) / (1 + coordinationHours / 8),
    ) *
    (0.6 + 0.4 * mean(members.map((p) => p.energy)))
  );
}
export const zeros6 = (): Vector6 => [0, 0, 0, 0, 0, 0];
