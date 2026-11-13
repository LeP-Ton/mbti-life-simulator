import assert from "node:assert/strict";
import test from "node:test";
import { isDeepStrictEqual } from "node:util";
import { FUNCTIONS } from "../simulation/types";
import { defaultScenario, DEFAULT_PARAMETERS } from "./config";
import {
  decide,
  generatePlans,
  observe,
  personalityBonus,
  punishmentKey,
} from "./decision";
import {
  collectMetrics,
  createEmitter,
  branchWorld,
  stepWorld,
} from "./engine";
import {
  accrue,
  accountingError,
  cash,
  settleClaims,
  totalCash,
  transfer,
} from "./ledger";
import { announceVacancies, deferredAcceptance } from "./markets";
import {
  betaMean,
  emptyEmotions,
  newBelief,
  softmax,
  taskQuality,
  totalHours,
  updateBeta,
  updateEmotions,
} from "./math";
import { ageOf, assertWorld, checkpoint, createWorld } from "./population";
import {
  evaluatePredictions,
  householdSplit,
  latinHypercube,
  runExperiment,
  summarizeEffects,
  SENSITIVITY_BOUNDS,
} from "./research";
import { projectLife, runBranch, runWorld } from "./run";
import type {
  ExperimentCell,
  LedgerEntry,
  World,
  WorldCheckpoint,
  WorldEvent,
} from "./types";

const config = (population = 60, months = 12) =>
  defaultScenario({ seed: "test-social-v2", population, months });
const reverse = <T>(record: Record<string, T>) =>
  Object.fromEntries(Object.entries(record).reverse());
test("政策效应分别使用一年与终点的配对差，不能混用观测窗口", () => {
  const base = collectMetrics(createWorld(config(12, 1))),
    cells: ExperimentCell[] = [];
  for (const replicate of [0, 1])
    for (const punitive of [0.2, 0.8])
      cells.push({
        model: "none",
        punitive,
        learning: false,
        replicate,
        seed: `paired-${replicate}`,
        year1: {
          ...base,
          observedOpportunities: 10,
          publicReports: punitive === 0.8 ? 4 : 2,
        },
        year5: {
          ...base,
          observedOpportunities: 10,
          publicReports: punitive === 0.8 ? 2 : 3,
        },
      });
  const effects = summarizeEffects(cells).filter(
    (e) => e.metric === "publicRate",
  );
  assert.equal(effects.find((e) => e.horizon === "year1")!.mean, 0.2);
  assert.ok(
    Math.abs(effects.find((e) => e.horizon === "endpoint")!.mean + 0.1) < 1e-14,
  );
  assert.ok(effects.every((e) => e.n === 2 && e.standardError === 0));
});
function stripped(world: World) {
  const copy = structuredClone(world);
  for (const p of Object.values(copy.persons))
    p.profiles = {
      ...p.profiles,
      initialJung8: {} as never,
      initialBig5: {} as never,
      effectiveJung8: {} as never,
      effectiveBig5: {} as never,
    };
  return copy;
}

test("默认社会确有一千人、四百户、六所学校与竞争企业，并保留亲属年龄条件", () => {
  const world = createWorld(defaultScenario()),
    sizes = Object.values(world.households).map((h) => h.memberIds.length);
  assert.equal(Object.keys(world.persons).length, 1000);
  assert.equal(sizes.length, 400);
  assert.deepEqual(
    [1, 2, 3, 5].map((n) => sizes.filter((v) => v === n).length),
    [100, 100, 150, 50],
  );
  assert.equal(Object.keys(world.schools).length, 6);
  assert.equal(Object.keys(world.firms).length, 36);
  assert.equal(ageOf(world.persons[world.focalPersonId], 0), 15);
  for (const p of Object.values(world.persons))
    for (const guardian of p.guardianIds)
      assert.ok(ageOf(world.persons[guardian], 0) - ageOf(p, 0) >= 18);
  for (const p of Object.values(world.persons))
    assert.ok(
      Object.values(world.relations).filter(
        (e) => !e.family && (e.a === p.id || e.b === p.id),
      ).length <= 24,
    );
  assertWorld(world);
  assert.equal(accountingError(world), 0);
});

test("同种子、主体容器重排仍产生相同事件、账本和完整世界", () => {
  const a = createWorld(config()),
    b = structuredClone(a);
  b.persons = reverse(b.persons);
  b.households = reverse(b.households);
  b.firms = reverse(b.firms);
  b.positions = reverse(b.positions);
  b.schools = reverse(b.schools);
  b.relations = reverse(b.relations);
  for (let m = 0; m < 8; m++)
    assert.ok(
      isDeepStrictEqual(
        stepWorld(a, { checkInvariants: true }),
        stepWorld(b, { checkInvariants: true }),
      ),
      `第 ${m + 1} 月主体重排改变了结果`,
    );
  assert.deepEqual(a, b);
});

test("无人格模型改变任意初始及有效画像均不改变行为或社会结果", () => {
  const a = createWorld({ ...config(), model: "none" }),
    b = structuredClone(a);
  for (const p of Object.values(b.persons)) {
    for (const key of FUNCTIONS) {
      p.profiles.effectiveJung8[key] = 100 - p.profiles.effectiveJung8[key];
      p.profiles.initialJung8[key] = 0;
    }
    for (const key of ["O", "C", "E", "A", "N"] as const) {
      p.profiles.effectiveBig5[key] = 1;
      p.profiles.initialBig5[key] = 0;
    }
  }
  for (let m = 0; m < 6; m++) assert.deepEqual(stepWorld(a), stepWorld(b));
  assert.deepEqual(stripped(a), stripped(b));
});

test("原始任务质量不读取身份或人格；八维相同分数的偏好项为零", () => {
  const evidence = {
    knowledge: 0.6,
    practice: 0.4,
    energy: 0.8,
    hours: 32,
    requiredHours: 40,
    disturbance: 0,
  };
  assert.equal(
    taskQuality({
      ...evidence,
      ...{ gender: "女", age: 20, personality: "INTJ" },
    }),
    taskQuality({
      ...evidence,
      ...{ gender: "男", age: 60, personality: "ENFP" },
    }),
  );
  const p = createWorld(config()).persons["person-00000"];
  for (const k of FUNCTIONS) p.profiles.effectiveJung8[k] = 83;
  assert.equal(
    personalityBonus(p, "jung8", [1, 1, 1, 1, 1, 1], [1, 1, 1, 1, 1, 1], 0.25),
    0,
  );
});

test("观察不泄漏机构处罚规则、真实缺陷、他人画像或未知岗位", () => {
  const world = createWorld(config()),
    person = Object.values(world.persons).find((p) => p.employment.positionId)!;
  person.knownVacancies = {};
  const view = observe(world, person.id),
    serialized = JSON.stringify(view);
  assert.equal(view.knownPositions.length, 0);
  for (const hidden of [
    "realDefect",
    "punitive",
    "initialJung8",
    "effectiveBig5",
    "truth",
  ])
    assert.ok(!serialized.includes(hidden));
  assert.ok(generatePlans(view, person).every((p) => p.id !== "search"));
});

test("四子步计划有半小时精度且不重复安排工作、课程和照料", () => {
  const world = createWorld(config());
  for (const p of Object.values(world.persons).filter(
    (p) => p.alive && ageOf(p, 0) >= 15,
  )) {
    p.state.health = 0.37;
    p.careHours = 23.5;
    const o = observe(world, p.id),
      d = decide(o, p, world.parameters, world.personalityModel);
    for (const c of d.candidates) {
      assert.ok(totalHours(c.plan.hours) <= o.availableHours);
      assert.ok(
        Object.values(c.plan.hours).every(
          (h) => h >= 0 && h * 2 === Math.floor(h * 2),
        ),
      );
      assert.equal(c.plan.hours.care, 23.5);
    }
    if (p.education.path === "school")
      assert.ok(d.candidates.every((c) => c.plan.id !== "search"));
  }
});

test("Beta 独立证据、遗忘、组织隔离和给定数值适应案例", () => {
  let belief = newBelief();
  for (let i = 1; i <= 8; i++)
    belief = updateBeta(belief, true, i * 4, i, Infinity);
  assert.equal(belief.alpha, 10);
  assert.equal(belief.beta, 2);
  assert.deepEqual(updateBeta(belief, true, 40, 8, Infinity), belief);
  const forgotten = updateBeta(
    belief,
    false,
    belief.lastUpdatedTick + 96,
    9,
    24,
  );
  assert.equal(forgotten.alpha, 6);
  assert.equal(forgotten.beta, 3);
  const probability = (p: number) =>
    softmax([(0.45 - 0.8 * p - 0.02) / 0.15, 0.08 / 0.15])[0];
  assert.ok(Math.abs(probability(0.5) - 0.41743) < 0.0001);
  assert.ok(Math.abs(probability(betaMean(belief)) - 0.108) < 0.001);
  assert.notEqual(
    punishmentKey("A", "public", 0.9),
    punishmentKey("B", "public", 0.9),
  );
});

test("情绪没有新事件时严格按七点五天半衰，正事件不会凭空产生愤怒", () => {
  const neutral = {
      desirability: 0,
      norm: 0,
      self: 0,
      other: 0,
      likelihood: 0,
      severity: 0,
    },
    e = { ...emptyEmotions(), fear: 0.8, anger: 0.4 };
  const next = updateEmotions(e, neutral, 7.5);
  assert.ok(Math.abs(next.fear - 0.4) < 1e-12);
  assert.ok(Math.abs(next.anger - 0.2) < 1e-12);
  const joy = updateEmotions(
    emptyEmotions(),
    { ...neutral, desirability: 1, norm: 1, other: 1 },
    0,
  );
  assert.equal(joy.joy, 0.6);
  assert.equal(joy.anger, 0);
  assert.equal(joy.gratitude, 0.6);
});

test("账本内部转移守恒，现金不够按比例支付且保留真实欠款", () => {
  const world = createWorld(config()),
    ledger: LedgerEntry[] = [],
    from = Object.values(world.firms)[0].accountId,
    people = Object.values(world.persons).slice(0, 2);
  const initial = totalCash(world),
    balance = cash(world, from);
  transfer(
    world,
    ledger,
    from,
    "external",
    balance - 101,
    "测试外部支出",
    "case",
  );
  for (const p of people)
    accrue(world, {
      debtorAccountId: from,
      creditorAccountId: p.cashAccountId,
      amount: 100,
      category: "wage",
      eventId: "case",
      originMonth: 0,
    });
  settleClaims(world, ledger, from);
  assert.equal(cash(world, from), 0);
  assert.equal(
    Object.values(world.claims).reduce((s, c) => s + c.amount, 0),
    99,
  );
  assert.deepEqual(
    ledger
      .filter((l) => l.category === "偿还wage")
      .map((l) => l.amount)
      .sort(),
    [50, 51],
  );
  assert.equal(totalCash(world), initial - balance + 101);
  assert.equal(accountingError(world), 0);
  assert.throws(() =>
    transfer(world, ledger, from, people[0].cashAccountId, 0.5, "bad", "case"),
  );
});

test("延迟接受在容量冲突和提议顺序变化下保持唯一、稳定分配", () => {
  const preferences = { a: ["x", "y"], b: ["x", "y"], c: ["x", "y"] },
    score = (_: string, id: string) => ({ a: 1, b: 3, c: 2 })[id]!;
  const result = deferredAcceptance(preferences, { x: 1, y: 1 }, score);
  assert.deepEqual(result, { b: "x", c: "y" });
  assert.deepEqual(
    result,
    deferredAcceptance(reverse(preferences), { y: 1, x: 1 }, score),
  );
});

test("关闭公开信息时，不凭空向人物公布岗位", () => {
  const world = createWorld(config());
  world.parameters.publicInformation = 0;
  for (const p of Object.values(world.persons)) p.knownVacancies = {};
  announceVacancies(world);
  assert.ok(
    Object.values(world.persons).every(
      (p) => !Object.keys(p.knownVacancies).length,
    ),
  );
});

test("每月约束与现金恒等式持续成立，人数死亡后不再行动且不强制六十岁退休", () => {
  const world = createWorld(config(80));
  const worker = Object.values(world.persons).find(
    (p) => p.employment.positionId,
  )!;
  worker.birthMonth = -60 * 12;
  world.parameters.mortalityAnnual = [0, 0, 0, 0, 0, 0];
  stepWorld(world, { checkInvariants: true });
  assert.ok(worker.employment.positionId);
  for (let i = 0; i < 23; i++) {
    const r = stepWorld(world, { checkInvariants: true });
    assert.equal(r.metrics.accountingError, 0);
    assert.ok(r.metrics.employmentRate <= 1);
  }
  world.parameters.mortalityAnnual = [1, 1, 1, 1, 1, 1];
  const result = stepWorld(world, {
    captureDecisions: true,
    checkInvariants: true,
  });
  assert.equal(result.metrics.alive, 0);
  assert.equal(result.decisions.length, 0);
  assert.ok(Object.values(world.positions).every((p) => !p.holderId));
  assert.ok(Object.values(world.persons).every((p) => !p.commitments.length));
});

test("关闭信念学习后，组织回应不更新对应信念", () => {
  const world = createWorld({
    ...config(100),
    parameters: { ...DEFAULT_PARAMETERS, beliefLearning: false, issueRate: 1 },
  });
  for (let i = 0; i < 8; i++) stepWorld(world);
  assert.ok(world.counters.publicReports + world.counters.privateReports > 0);
  assert.ok(
    Object.values(world.persons).every(
      (p) => Object.keys(p.beliefs).length === 0,
    ),
  );
});

test("空白分支续跑与原世界完全一致，真实分支不篡改父快照", () => {
  const world = createWorld(config());
  for (let i = 0; i < 5; i++) stepWorld(world);
  const state = checkpoint(world),
    frozen = structuredClone(state),
    blank = branchWorld(state, { id: "empty", fromMonth: 6 });
  const changed = branchWorld(state, {
    id: "policy",
    fromMonth: 6,
    punitive: 0.8,
    lockPolicy: true,
  });
  for (let i = 0; i < 5; i++) {
    assert.deepEqual(stepWorld(world), stepWorld(blank));
    stepWorld(changed);
  }
  assert.deepEqual(world, blank);
  assert.deepEqual(state, frozen);
  assert.ok(
    Object.values(changed.firms).every((f) => f.policy.punitive === 0.8),
  );
  assert.throws(() => branchWorld(state, { id: "past", fromMonth: 5 }));
});

test("历史投影与整社会非年度分支可复现，不消耗随机状态或丢失前缀", async () => {
  const checkpoints = new Map<number, WorldCheckpoint>();
  const run = await runWorld(config(30, 18), {
      onCheckpoint: (s) => {
        checkpoints.set(s.month, s);
      },
    }),
    frozen = structuredClone(run);
  projectLife(run, "person-00000", 7);
  projectLife(run, "person-00000", 2);
  assert.deepEqual(run, frozen);
  const branch = await runBranch(run, checkpoints.get(0)!, 7, {
    id: "empty",
    fromMonth: 8,
  });
  assert.deepEqual(branch.finalWorld, run.finalWorld);
  assert.deepEqual(branch.frames, run.frames);
  assert.deepEqual(branch.events, run.events);
  assert.ok(checkpoints.has(12));
  assert.ok(checkpoints.has(18));
});

test("十二条件实验使用同一重复的外生种子，并按世界重复统计", async () => {
  const report = await runExperiment({
    seed: "experiment-test",
    population: 20,
    seeds: 2,
    warmupMonths: 2,
    followupMonths: 3,
  });
  assert.equal(report.cells.length, 24);
  assert.equal(report.calibrated, false);
  assert.ok(report.effects.every((e) => e.n === 2));
  assert.deepEqual(
    new Set(report.effects.map((e) => e.horizon)),
    new Set(["year1", "endpoint"]),
  );
  assert.ok(report.effects.some((e) => e.metric === "invalidReportShare"));
  assert.ok(report.effects.some((e) => e.metric === "separations"));
  assert.equal(
    new Set(report.cells.filter((c) => c.replicate === 0).map((c) => c.seed))
      .size,
    1,
  );
  assert.ok(report.cells.every((c) => c.year5.accountingError === 0));
});

test("六十四点拉丁超立方每维每层各有一个样本", () => {
  const rows = latinHypercube("lhs", 64);
  for (const [key, [lo, hi]] of Object.entries(SENSITIVITY_BOUNDS))
    assert.equal(
      new Set(
        rows.map((r) =>
          Math.floor(
            ((Number(r[key as keyof typeof r]) - lo) / (hi - lo)) * 64,
          ),
        ),
      ).size,
      64,
    );
});

test("外部预测验证严格隔离家庭、未来波次及用于强制对齐的样本", () => {
  const id = Array.from({ length: 100 }, (_, i) => `h${i}`).find(
    (id) => householdSplit(id) === "test",
  )!;
  const row = {
    householdId: id,
    month: 20,
    outcome: 1 as const,
    probability: 0.8,
    baselineProbability: 0.5,
    weight: 1,
    target: "employment",
  };
  const result = evaluatePredictions(
    [row, { ...row, month: 1 }, { ...row, aligned: true }],
    { futureAfterMonth: 10 },
  );
  assert.equal(result.samples, 1);
  assert.ok(Math.abs(result.model.brier - 0.04) < 1e-12);
  assert.ok(result.model.logLoss < result.baseline.logLoss);
  assert.equal(result.excludedAligned, 1);
});

test("死亡、欠薪和破产边界不会制造负现金，长期小社会可走完四十五年", () => {
  for (const model of ["jung8", "big5", "none"] as const) {
    const world = createWorld({ ...config(12, 540), model });
    for (let m = 0; m < 540; m++) stepWorld(world, { checkInvariants: true });
    assert.equal(collectMetrics(world).accountingError, 0);
    assert.equal(world.month, 540);
  }
});
