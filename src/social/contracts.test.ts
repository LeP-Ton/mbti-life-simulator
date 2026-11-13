import assert from "node:assert/strict";
import test from "node:test";
import { isDeepStrictEqual } from "node:util";
import {
  defaultScenario,
  DEFAULT_PARAMETERS,
  parameterBundle,
  validateParameters,
} from "./config";
import {
  decide,
  observe,
  punishmentKey,
  generatePlans,
  longTermValue,
} from "./decision";
import { admit, applyAppointments } from "./markets";
import { createEmitter, stepWorld } from "./engine";
import { considerEntrants, householdNeed } from "./economy";
import { consolidate } from "./evolution";
import { accountingError, monthlyTuition, totalCash } from "./ledger";
import { consumeMaintenance, scheduleMaintenance } from "./maintenance";
import { createWorld } from "./population";
import { runStructuralAblation } from "./structure";
import type { Experience, LedgerEntry, WorldEvent } from "./types";
import { exp, ln, pow, cos } from "./numeric";

const config = () =>
  defaultScenario({ seed: "contracts-v2", population: 45, months: 12 });
test("职责耗尽可用时间时，不提供零工时的学习、社交、表达或核实", () => {
  const world = createWorld(config()),
    person = Object.values(world.persons).find((p) => p.employment.positionId)!,
    original = observe(world, person.id);
  const plans = generatePlans(
    {
      ...original,
      availableHours: 40,
      careHours: 0,
      requiredWork: 40,
      requiredCourse: 0,
      issue: {
        id: "fixture",
        firmId: original.currentFirmId!,
        confidence: 0.9,
      },
    },
    person,
  );
  assert.deepEqual(
    plans.map((p) => p.id),
    ["deliver", "silent"],
  );
});
test("处罚在余暇用尽时转换有薪工时，仍付出完整四小时代价", () => {
  const world = createWorld({
    ...config(),
    parameters: {
      ...DEFAULT_PARAMETERS,
      issueRate: 0,
      assessmentAccuracy: 1,
      healthAnnualRisk: 0,
      birthAnnualRisk: 0,
      mortalityAnnual: [0, 0, 0, 0, 0, 0],
    },
  });
  const person = Object.values(world.persons).find(
      (p) => p.employment.positionId,
    )!,
    firm = world.firms[world.positions[person.employment.positionId!].firmId];
  person.state.health = 0.08;
  firm.policy.punitive = 1 - 1e-12;
  world.issues.fixture = {
    id: "fixture",
    firmId: firm.id,
    personId: person.id,
    createdTick: 4,
    expiresTick: 7,
    realDefect: false,
    confidence: 0.9,
    noticed: true,
    resolved: false,
  };
  // 夹具固定本次选择，以便独立检验执行与结算，不检验选择偏好。
  person.habits[`${observe(world, person.id).context}/public`] = 100;
  const result = stepWorld(world),
    event = result.events.find(
      (e) => e.kind === "expression" && e.actorIds.includes(person.id),
    );
  assert.ok(event?.truth.punished);
  assert.equal(event.truth.unpaidHours, 4);
  assert.equal(event.truth.convertedPaidHours, 4);
  assert.ok(person.employment.workHours <= 156);
  assert.ok(person.monthlyHours.work <= 160);
});
test("换岗后原组织的问题停止成为行动选项，真实缺陷保留后续维护", () => {
  const world = createWorld({
    ...config(),
    parameters: {
      ...DEFAULT_PARAMETERS,
      issueRate: 0,
      healthAnnualRisk: 0,
      birthAnnualRisk: 0,
      mortalityAnnual: [0, 0, 0, 0, 0, 0],
    },
  });
  const person = Object.values(world.persons).find(
      (p) => p.employment.positionId,
    )!,
    previous = world.positions[person.employment.positionId!],
    next = Object.values(world.positions).find(
      (p) => !p.holderId && p.firmId !== previous.firmId,
    )!;
  world.issues.fixture = {
    id: "fixture",
    firmId: previous.firmId,
    personId: person.id,
    createdTick: 4,
    expiresTick: 7,
    realDefect: true,
    confidence: 0.9,
    noticed: true,
    resolved: false,
  };
  previous.holderId = null;
  next.holderId = person.id;
  next.enabled = true;
  person.employment.positionId = next.id;
  const result = stepWorld(world);
  assert.ok(!world.issues.fixture);
  assert.ok(
    !result.events.some(
      (e) => e.kind === "expression" && e.truth.issueId === "fixture",
    ),
  );
  assert.ok(
    world.pendingEvents.some(
      (e) => e.id === "repair:fixture" && e.targetId === previous.firmId,
    ),
  );
  assert.ok(
    !Object.keys(person.beliefs).some((k) =>
      k.startsWith(`${previous.firmId}/`),
    ),
  );
});
test("整月无生产工时不生成季度交付作品", () => {
  const world = createWorld({
    ...config(),
    parameters: {
      ...DEFAULT_PARAMETERS,
      issueRate: 0,
      healthAnnualRisk: 0,
      birthAnnualRisk: 0,
      mortalityAnnual: [0, 0, 0, 0, 0, 0],
    },
  });
  const person = Object.values(world.persons).find(
      (p) => p.employment.positionId,
    )!,
    firm = world.firms[world.positions[person.employment.positionId!].firmId];
  scheduleMaintenance(firm, {
    id: "maintenance-fixture",
    remaining: 1e6,
    total: 1e6,
    realDefect: false,
    causeId: "fixture",
  });
  const result = stepWorld(world);
  assert.equal(person.employment.productiveHours, 0);
  assert.ok(
    !result.events.some(
      (e) => e.kind === "work-evidence" && e.actorIds.includes(person.id),
    ),
  );
  assert.equal(person.development.works.length, 0);
});
test("跳过未请求的事件物化不改变世界、账本、证据序号或指标", () => {
  const a = createWorld(config()),
    b = structuredClone(a);
  for (let i = 0; i < 36; i++) {
    const full = stepWorld(a),
      compact = stepWorld(b, { captureEvents: false });
    assert.ok(full.events.length);
    assert.equal(compact.events.length, 0);
    assert.ok(isDeepStrictEqual(full.ledger, compact.ledger));
    assert.ok(isDeepStrictEqual(full.metrics, compact.metrics));
  }
  assert.ok(isDeepStrictEqual(a, b));
});
test("参数完整性、单位、来源矩阵与期初资金来源均可审计", () => {
  assert.throws(() => validateParameters({} as never));
  assert.throws(() =>
    validateParameters({ ...DEFAULT_PARAMETERS, temperature: 0 }),
  );
  assert.throws(() =>
    validateParameters({ ...DEFAULT_PARAMETERS, housingCost: 0.1 }),
  );
  const world = createWorld(config()),
    bundle = parameterBundle(world.parameters);
  assert.equal(
    world.openingAccounts.reduce((s, a) => s + a.amount, 0),
    totalCash(world),
  );
  assert.ok(world.openingAccounts.every((a) => a.source));
  assert.equal(
    bundle.evidence.filter((e) => e.key.startsWith("preferenceMatrix.")).length,
    13,
  );
  assert.ok(bundle.evidence.every((e) => e.status === "hypothesis"));
  assert.ok(
    Object.values(world.persons).every((p) =>
      Object.values(p.profiles.initialBig5).every((v) => v >= 0 && v <= 1),
    ),
  );
});

test("年度学费拆分为整数分后仍严格等于年费", () => {
  for (const fee of [600000, 400000, 200000])
    assert.equal(
      Array.from({ length: 12 }, (_, i) => monthlyTuition(fee, i)).reduce(
        (a, b) => a + b,
        0,
      ),
      fee,
    );
});

test("未来宏观冲击不会提前作用，外部拨款显式入账", () => {
  const world = createWorld({
    ...config(),
    macroSeries: [
      { month: 3, demandIndex: 0.3, priceIndex: 1.2, governmentGrant: 123456 },
    ],
  });
  const before = JSON.stringify(observe(world, "person-00000"));
  assert.ok(!before.includes("governmentGrant"));
  stepWorld(world);
  stepWorld(world);
  assert.equal(world.externalSector.demandIndex, 1);
  const result = stepWorld(world);
  assert.equal(world.externalSector.demandIndex, 0.3);
  assert.equal(world.externalSector.priceIndex, 1.2);
  assert.ok(
    result.ledger.some(
      (l) =>
        l.from === "external" && l.to === "government" && l.amount === 123456,
    ),
  );
  assert.equal(accountingError(world), 0);
  assert.throws(() =>
    createWorld({ ...config(), macroSeries: [{ month: 1, demandIndex: -1 }] }),
  );
});
test("物价冲击作用于生活与住房的实际总支出，不能提供零价格的无限基本消费", () => {
  const world = createWorld(config()),
    id = Object.keys(world.households)[0],
    base = householdNeed(world, id);
  world.externalSector.priceIndex = 1.2;
  assert.equal(householdNeed(world, id), Math.round(base * 1.2));
  assert.throws(() =>
    createWorld({ ...config(), macroSeries: [{ month: 1, priceIndex: 0 }] }),
  );
});

test("统一外生接口执行指定死亡，相关岗位与未来承诺明确终止", () => {
  const world = createWorld({
    ...config(),
    exogenousEvents: [{ month: 1, kind: "death", targetId: "person-00001" }],
  });
  world.pendingEvents.push({
    id: "fixture-future",
    dueMonth: 2,
    kind: "leave",
    personId: "person-00001",
    causeId: "fixture",
    payload: {},
  });
  const result = stepWorld(world, { captureDecisions: true });
  const dead = world.persons["person-00001"];
  assert.equal(dead.alive, false);
  assert.equal(dead.commitments.length, 0);
  assert.equal(dead.employment.positionId, null);
  assert.ok(!world.pendingEvents.some((e) => e.personId === dead.id));
  assert.ok(!result.decisions.some((d) => d.personId === dead.id));
  assert.equal(
    Object.values(dead.monthlyHours).reduce((s, h) => s + h, 0),
    0,
  );
});
test("死亡后的家庭流水只提供给在世成员，人物不能继续得到未来观察", () => {
  const world = createWorld({
    ...config(),
    exogenousEvents: [{ month: 1, kind: "death", targetId: "person-00001" }],
  });
  stepWorld(world);
  const next = stepWorld(world);
  assert.ok(next.events.every((e) => !e.observations["person-00001"]));
  assert.throws(() => observe(world, "person-00001"));
});

test("实际修复先排队，再占用工时，最后才增加修复计数", () => {
  const world = createWorld(config()),
    firm = Object.values(world.firms)[0],
    events: WorldEvent[] = [],
    emit = createEmitter(world, events);
  scheduleMaintenance(firm, {
    id: "repair-fixture",
    remaining: 8,
    total: 8,
    realDefect: true,
    causeId: "fixture",
  });
  assert.equal(world.counters.fixedDefects, 0);
  assert.equal(consumeMaintenance(world, firm, 3, "person-00001", emit), 3);
  assert.equal(world.counters.fixedDefects, 0);
  assert.equal(firm.correctionCost, 5);
  consumeMaintenance(world, firm, 7, "person-00001", emit);
  assert.equal(world.counters.fixedDefects, 1);
  assert.equal(world.counters.reworkHours, 8);
  assert.equal(firm.maintenanceTasks.length, 0);
});

test("主观处罚概率改变公开表达概率，基础人格完全保留", () => {
  const world = createWorld(config()),
    p = Object.values(world.persons).find((p) => p.employment.positionId)!,
    position = world.positions[p.employment.positionId!];
  world.issues.fixture = {
    id: "fixture",
    firmId: position.firmId,
    personId: p.id,
    createdTick: 0,
    expiresTick: 3,
    realDefect: true,
    confidence: 0.9,
    noticed: true,
    resolved: false,
  };
  const o = observe(world, p.id),
    initial = structuredClone(p.profiles);
  const probability = (punish: number) =>
    decide(
      { ...o, punishmentBeliefs: { public: punish, private: 0.2 } },
      p,
      parameterBundle(world.parameters),
    ).candidates.find((c) => c.plan.id === "public")!.probability;
  assert.ok(probability(0.9) < probability(0.1));
  assert.deepEqual(p.profiles, initial);
  assert.equal(
    p.beliefs[punishmentKey("unseen-organization", "public", 0.9)],
    undefined,
  );
});

test("每笔真实运行流水的原因都能追溯到本期或之前的实际事件", () => {
  const world = createWorld(config()),
    seen = new Map<string, number>();
  for (let month = 0; month < 18; month++) {
    const result = stepWorld(world);
    for (const e of result.events) {
      for (const cause of e.causeIds)
        assert.ok(seen.has(cause), `${e.id} 引用了不存在或未来的原因 ${cause}`);
      seen.set(e.id, e.month);
    }
    for (const row of result.ledger)
      assert.ok(
        seen.has(row.causeId) && seen.get(row.causeId)! <= row.month,
        `${row.category} 缺少真实原因事件`,
      );
  }
});

test("欠费退学不会抹去已经发生的教育债务", () => {
  const world = createWorld({
    ...config(),
    parameters: {
      ...DEFAULT_PARAMETERS,
      totalDemand: 0,
      birthAnnualRisk: 0,
      healthAnnualRisk: 0,
      mortalityAnnual: [0, 0, 0, 0, 0, 0],
    },
  });
  for (const account of Object.values(world.accounts)) account.balance = 0;
  for (const position of Object.values(world.positions))
    position.holderId = null;
  for (const p of Object.values(world.persons)) {
    p.employment.positionId = null;
    p.commitments = [];
  }
  const p = world.persons["person-00000"];
  p.birthMonth = -20 * 12;
  p.education.path = "university";
  p.education.schoolId = "school-0";
  world.externalSector.openingCash = 0;
  stepWorld(world);
  const result = stepWorld(world);
  assert.equal(p.education.schoolId, null);
  assert.ok(
    result.events.some(
      (e) => e.kind === "dropout" && e.actorIds.includes(p.id),
    ),
  );
  assert.ok(
    Object.values(world.claims).some(
      (c) =>
        c.category === "tuition" &&
        c.debtorAccountId === world.households[p.householdId].accountId,
    ),
  );
  assert.equal(accountingError(world), 0);
});

test("新企业由投资者已有资金建立，内部股本支付不增加社会现金", () => {
  const world = createWorld(config()),
    ledger: LedgerEntry[] = [],
    events: WorldEvent[] = [],
    first = Object.values(world.firms)[0];
  for (const firm of Object.values(world.firms))
    if (firm.regionId === first.regionId && firm.domain === first.domain) {
      firm.status = "closed";
      for (const id of firm.positionIds) {
        const position = world.positions[id];
        if (position.holderId)
          world.persons[position.holderId].employment.positionId = null;
        position.holderId = null;
      }
    }
  for (const household of Object.values(world.households))
    world.accounts[household.accountId].balance = 100000000;
  world.externalSector.openingCash = totalCash(world);
  world.month = 3;
  const before = totalCash(world);
  considerEntrants(world, ledger, createEmitter(world, events));
  const newFirms = Object.values(world.firms).filter((f) =>
    f.id.startsWith("entry:"),
  );
  assert.equal(newFirms.length, 1);
  assert.ok(ledger.length > 0);
  assert.equal(totalCash(world), before);
  assert.equal(accountingError(world), 0);
});

test("可塑性必须达到多情境证据门槛，年度变化不能超过百分制一点", () => {
  const p = createWorld(config()).persons["person-00000"],
    initial = structuredClone(p.profiles.initialJung8);
  const experiences: Experience[] = Array.from({ length: 30 }, (_, i) => ({
    eventId: `e${i}`,
    sequence: i,
    tick: i,
    context: `org/${["routine", "search", "issue"][i % 3]}`,
    counterpartId: `partner${i % 2}`,
    action: "public",
    reward: 1,
    expected: 0,
    probability: 0.5,
    probabilities: { public: 0.5 },
    features: [1, 1, 1, 1, 1, 1],
  }));
  p.memory.annual = experiences;
  consolidate(p, 12, { ...DEFAULT_PARAMETERS, plasticity: true }, "jung8");
  assert.equal(p.profiles.version, 1);
  assert.deepEqual(p.profiles.initialJung8, initial);
  assert.ok(
    Object.keys(initial).every(
      (k) =>
        Math.abs(
          p.profiles.effectiveJung8[k as keyof typeof initial] -
            initial[k as keyof typeof initial],
        ) <= 1,
    ),
  );
  p.memory.annual = experiences.slice(0, 2);
  consolidate(p, 24, { ...DEFAULT_PARAMETERS, plasticity: true }, "jung8");
  assert.equal(p.profiles.version, 1);
  assert.equal(p.memory.revisions.at(-1)!.status, "deferred");
});

test("四种学习结构可以在相同世界重复上进行独立对照", async () => {
  const report = await runStructuralAblation({
    seed: "structure-test",
    population: 12,
    seeds: 1,
    warmupMonths: 1,
    months: 3,
  });
  assert.equal(report.cells.length, 4);
  assert.equal(new Set(report.cells.map((c) => c.seed)).size, 1);
  assert.ok(report.cells.every((c) => c.metrics.accountingError === 0));
  assert.ok(report.cells.slice(0, 3).every((c) => c.meanTraitDrift === 0));
});
test("只修改观察人物八维时，不连带重设现金、家庭或身份", () => {
  const base = config(),
    a = createWorld(base),
    p = a.persons[a.focalPersonId],
    scores = Object.fromEntries(
      Object.keys(p.profiles.initialJung8).map((k) => [k, 40]),
    ) as typeof p.profiles.initialJung8;
  const b = createWorld({
      ...base,
      focal: {
        jung8: scores,
        gender: "非二元",
        familyResources: 0,
        region: "远岚县",
        profileOnly: true,
      },
    }),
    q = b.persons[b.focalPersonId];
  assert.equal(q.gender, p.gender);
  assert.equal(q.regionId, p.regionId);
  assert.deepEqual(b.accounts, a.accounts);
  assert.deepEqual(b.households, a.households);
  assert.deepEqual(q.profiles.initialJung8, scores);
});
test("任务成败经过先衰减后注入的真实情绪反馈，保留双精度", () => {
  const world = createWorld({
    ...config(),
    model: "none",
    parameters: {
      ...DEFAULT_PARAMETERS,
      temperature: 1e-5,
      issueRate: 0,
      healthAnnualRisk: 0,
      birthAnnualRisk: 0,
      mortalityAnnual: [0, 0, 0, 0, 0, 0],
    },
  });
  const person = Object.values(world.persons).find(
    (p) => p.employment.positionId,
  )!;
  person.motives = {
    material: 0,
    security: 1,
    mastery: 0,
    autonomy: 0,
    belonging: 0,
    fairness: 0,
  };
  person.state.energy = 0.1;
  person.state.stress = 1;
  const result = stepWorld(world),
    tasks = result.events.filter(
      (e) => e.kind === "task-result" && e.actorIds.includes(person.id),
    );
  assert.equal(tasks.length, 4);
  let joy = 0;
  for (const task of tasks) {
    joy *= 0.5;
    if (task.truth.success) joy = 1 - (1 - joy) * (1 - 0.6 * 0.25);
  }
  assert.ok(Math.abs(person.state.emotions.joy - joy) < 1e-14);
  for (const task of tasks) {
    const expected =
      1 /
      (1 +
        Math.exp(
          -(Number(task.truth.quality) - Number(task.truth.difficulty)) / 0.1,
        ));
    assert.ok(Math.abs(Number(task.truth.pSuccess) - expected) < 1e-14);
  }
  assert.equal(
    world.counters.taskAttempts,
    Object.values(world.persons).reduce(
      (s, p) => s + p.employment.attemptedTasks,
      0,
    ),
  );
});
test("可移植数学实现保持双精度，不以显示性量化掩盖运行环境差异", () => {
  for (const x of [-20, -1, -0.1, 0, 0.1, 1, 20]) {
    assert.ok(
      Math.abs(exp(x) - Math.exp(x)) / Math.max(1, Math.exp(x)) < 2e-15,
    );
    if (x > 0) assert.ok(Math.abs(ln(x) - Math.log(x)) < 2e-15);
    assert.ok(Math.abs(cos(x) - Math.cos(x)) < 2e-15);
  }
  assert.equal(pow(2, -1), 0.5);
  assert.ok(Math.abs(pow(0.995, 120) - 0.995 ** 120) < 2e-15);
});
test("课程转换竞争真实名额、下月生效，知识保留而课程学分重新累计", () => {
  const world = createWorld(config()),
    person = world.persons[world.focalPersonId],
    events: WorldEvent[] = [],
    emit = createEmitter(world, events);
  person.birthMonth = -240;
  person.education = {
    ...person.education,
    path: "university",
    schoolId: "school-0",
    level: 1,
    credits: 12,
  };
  person.development.examPractice = 1;
  for (const d of Object.keys(person.development.knowledge))
    person.development.knowledge[
      d as keyof typeof person.development.knowledge
    ] = 0.9;
  world.month = 1;
  const knowledge = structuredClone(person.development.knowledge),
    observation = observe(world, person.id);
  assert.ok(observation.currentCourse);
  assert.ok(observation.schools.every((s) => s.id !== "school-0"));
  admit(world, new Set([person.id]), emit);
  assert.ok(
    world.pendingEvents.some(
      (e) => e.personId === person.id && e.kind === "school",
    ),
  );
  applyAppointments(world, emit);
  assert.equal(person.education.schoolId, "school-0");
  world.month = 2;
  applyAppointments(world, emit);
  assert.notEqual(person.education.schoolId, "school-0");
  assert.equal(person.education.credits, 0);
  assert.deepEqual(person.development.knowledge, knowledge);
  assert.ok(events.some((e) => e.truth.discardedCredits === 12));
});
test("升学预期只在未来路径扣学费，放弃已有工资降低十年净收益", () => {
  const world = createWorld(config()),
    person = world.persons[world.focalPersonId];
  person.birthMonth = -240;
  person.education.path = "none";
  const o = observe(world, person.id),
    plans = generatePlans(o, person),
    enrol = plans.find((p) => p.id === "enrol")!;
  assert.ok(enrol);
  assert.equal(enrol.outcomes[0], 0);
  const low = longTermValue({ ...o, wage: 0 }, person, enrol.targetId!),
    high = longTermValue({ ...o, wage: 700000 }, person, enrol.targetId!);
  assert.ok(high < low);
});
