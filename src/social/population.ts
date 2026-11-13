import { DOMAINS, FUNCTIONS } from "../simulation/types";
import { generateScores } from "../simulation/personality";
import { hash } from "../simulation/random";
import {
  DEFAULT_PARAMETERS,
  domainValues,
  domainWeights,
  PARAMETER_ID,
  REGIONS,
  SOCIAL_VERSION,
  validateParameters,
  WAGES,
} from "./config";
import {
  beta22,
  bounded,
  clamp01,
  emptyEmotions,
  emptyHours,
  mean,
  newBelief,
  normal,
  sigmoid,
  uniform,
} from "./math";
import { totalCash } from "./ledger";
import {
  BIG5,
  NEEDS,
  type Domain,
  type Person,
  type ScenarioConfig,
  type World,
  type WorldCheckpoint,
} from "./types";
import { validateScenarioInputs } from "./exogenous";
import { exp } from "./numeric";

export const ageOf = (person: Person, month: number) =>
  (month - person.birthMonth) / 12;
export const sortedPeople = (world: World) =>
  Object.values(world.persons).sort((a, b) => a.id.localeCompare(b.id));
export const primaryDomain = (person: Person): Domain =>
  DOMAINS.reduce(
    (best, d) =>
      person.interests[d] > person.interests[best] ||
      (person.interests[d] === person.interests[best] &&
        d.localeCompare(best) < 0)
        ? d
        : best,
    DOMAINS[0],
  );
export const tickOf = (world: World) => world.month * 4 + world.substep;
export const edgeId = (a: string, b: string) => [a, b].sort().join("~");

export function createPerson(
  world: World,
  id: string,
  age: number,
  householdId: string,
  regionId: string,
  resource: number,
  parentalEducation: number,
  name?: string,
): Person {
  const profileSeed = `${world.seeds.profiles}:${id}`;
  const birthMonth = world.month - Math.floor(age * 12);
  const jung8 = generateScores(profileSeed);
  const big5 = Object.fromEntries(
    BIG5.map((k) => [k, beta22(profileSeed, k)]),
  ) as Person["profiles"]["initialBig5"];
  const weights = NEEDS.map(
    (k) => 0.5 + uniform(world.seeds.population, 0, `${id}:motive:${k}`),
  );
  const weightSum = weights.reduce((a, b) => a + b, 0);
  const priorYears = Math.max(0, age - 15);
  const focus =
    DOMAINS[
      Math.floor(
        uniform(world.seeds.population, 0, `${id}:interest`) * DOMAINS.length,
      )
    ];
  const knowledge = domainValues(0),
    practice = domainValues(0),
    interests = domainValues(0);
  for (const d of DOMAINS) {
    // 年龄只用于构造明确标注的期初既往经历，不参与运行期任务质量。
    knowledge[d] = clamp01(
      0.1 +
        0.08 * resource +
        0.04 * parentalEducation +
        Math.min(priorYears, 20) * (d === focus ? 0.018 : 0.005),
    );
    practice[d] = clamp01(
      0.04 + Math.min(priorYears, 28) * (d === focus ? 0.023 : 0.004),
    );
    interests[d] =
      d === focus
        ? 0.65 + uniform(profileSeed, 0, `interest:${d}`) * 0.25
        : 0.2 + uniform(profileSeed, 0, `interest:${d}`) * 0.4;
  }
  const accountId = `account:${id}`;
  world.accounts[accountId] = {
    id: accountId,
    ownerId: id,
    kind: "person",
    balance: Math.round((age < 18 ? 1000 : 3000) * 100 * (0.5 + resource)),
  };
  const person: Person = {
    id,
    name:
      name ??
      `${["周", "林", "许", "沈", "陈", "江"][hash(id) % 6]}${["予安", "知夏", "星遥", "见川", "听禾", "时雨"][hash(`${id}:name`) % 6]}·${id.slice(-3)}`,
    birthMonth,
    alive: true,
    diedMonth: null,
    householdId,
    regionId,
    gender:
      uniform(world.seeds.population, 0, `${id}:gender`) < 0.5 ? "女" : "男",
    guardianIds: [],
    profiles: {
      initialJung8: { ...jung8 },
      initialBig5: { ...big5 },
      effectiveJung8: { ...jung8 },
      effectiveBig5: { ...big5 },
      version: 0,
    },
    motives: Object.fromEntries(
      NEEDS.map((k, i) => [k, weights[i] / weightSum]),
    ) as Person["motives"],
    values: {
      honesty: 0.5 + uniform(profileSeed, 0, "value:honesty") * 0.5,
      fairness: 0.5 + uniform(profileSeed, 0, "value:fairness") * 0.5,
      boundaries: uniform(profileSeed, 0, "value:boundaries"),
    },
    development: {
      knowledge,
      practice,
      examPractice: age < 18 ? 0.15 : 0.3,
      credentials: [],
      works: [],
    },
    state: {
      health: age >= 65 ? 0.75 : 1,
      energy: 0.8,
      stress: 0.2,
      emotions: emptyEmotions(),
      wellbeing: Object.fromEntries(
        NEEDS.map((k) => [k, 0.5]),
      ) as Person["state"]["wellbeing"],
    },
    education: {
      path: age < 18 ? "school" : "completed",
      schoolId: null,
      domain: focus,
      level: age < 18 ? 0 : resource + parentalEducation > 1 ? 2 : 1,
      startedMonth: 0,
      credits: 0,
      unpaidMonths: 0,
      absenceMonths: 0,
      attendance: 1,
    },
    employment: {
      positionId: null,
      startedMonth: 0,
      searchMonths: 0,
      lastGrossWage: 0,
      lastIncome: 0,
      wageArrears: 0,
      contributions: 0,
      workHours: 0,
      productiveHours: 0,
      qualitySum: 0,
      qualityCount: 0,
      attemptedTasks: 0,
      successfulTasks: 0,
      leaveReason: null,
    },
    cashAccountId: accountId,
    interests,
    beliefs: {},
    otherAgentModels: {},
    habits: {},
    commitments: [],
    memory: {
      recent: [],
      quarter: [],
      annual: [],
      revisions: [],
      lastAction: "recover",
      lastHours: emptyHours(),
      totalStudyHours: 0,
      totalPracticeHours: 0,
      totalWorkHours: 0,
      totalWorks: 0,
      observedOpportunities: 0,
      publicReports: 0,
      privateReports: 0,
      silentReports: 0,
      validReports: 0,
      invalidReports: 0,
    },
    knownVacancies: {},
    careHours: 0,
    monthlyHours: emptyHours(),
    personalNorm: 0.5,
  };
  if (age >= 18)
    person.development.credentials.push({
      id: `prior:${id}`,
      schoolId: "期初合成既往教育",
      level: person.education.level,
      month: -1,
    });
  return person;
}
export function connect(world: World, a: string, b: string, family = false) {
  if (a === b || !world.persons[a] || !world.persons[b]) return;
  const id = edgeId(a, b);
  if (world.relations[id]) {
    if (family) world.relations[id].family = true;
    return;
  }
  world.relations[id] = {
    id,
    a: [a, b].sort()[0],
    b: [a, b].sort()[1],
    family,
    strength: family ? 0.8 : 0.2,
    lastContactTick: tickOf(world),
    willingness: { [a]: newBelief(), [b]: newBelief() },
    reliability: { [a]: newBelief(), [b]: newBelief() },
  };
}
export function createWorld(config: ScenarioConfig): World {
  validateParameters(config.parameters);
  if (
    !Number.isInteger(config.population) ||
    config.population < 3 ||
    config.population > 10000
  )
    throw new Error("人口必须为 3—10000 的整数。");
  if (!["jung8", "big5", "none"].includes(config.model))
    throw new Error("未知人格模型。");
  if (
    !Number.isInteger(config.months) ||
    config.months < 0 ||
    config.months > 1200 ||
    config.trackedIds.length > 16
  )
    throw new Error("观察月份须为 0—1200，观察人物至多十六人。");
  const world: World = {
    schemaVersion: 2,
    ruleVersion: SOCIAL_VERSION,
    month: 0,
    substep: 0,
    scenarioId: `synthetic:${config.seed}:${config.population}`,
    parameterBundleId: PARAMETER_ID,
    personalityModel: config.model,
    seeds: {
      population: `${config.seed}:population`,
      profiles: `${config.seed}:profiles`,
      shocks: `${config.seed}:shocks`,
      actions: `${config.seed}:actions`,
      feedback: `${config.seed}:feedback`,
    },
    parameters: structuredClone(config.parameters ?? DEFAULT_PARAMETERS),
    focalPersonId: "person-00000",
    persons: {},
    households: {},
    schools: {},
    firms: {},
    positions: {},
    relations: {},
    accounts: {},
    claims: {},
    government: {
      accountId: "government",
      wageTax: config.parameters.wageTax,
      profitTax: config.parameters.profitTax,
      lastRequested: 0,
      lastPaid: 0,
    },
    externalSector: {
      inflow: 0,
      outflow: 0,
      openingCash: 0,
      demandIndex: 1,
      priceIndex: 1,
      segmentMultipliers: {},
    },
    scenarioInputs: {
      macroSeries: structuredClone(config.macroSeries ?? []),
      exogenousEvents: structuredClone(config.exogenousEvents ?? []),
    },
    openingAccounts: [],
    pendingEvents: [],
    issues: {},
    interventionHistory: [],
    eventSequence: 0,
    ledgerSequence: 0,
    personSequence: config.population,
    counters: {
      publicReports: 0,
      privateReports: 0,
      silentReports: 0,
      validReports: 0,
      invalidReports: 0,
      observedOpportunities: 0,
      defects: 0,
      fixedDefects: 0,
      taskAttempts: 0,
      taskSuccesses: 0,
      reworkHours: 0,
      punishmentSquaredError: 0,
      beliefSamples: 0,
      separations: 0,
      hires: 0,
    },
  };
  const pattern = [3, 1, 1, 2, 2, 3, 3, 5];
  let index = 0,
    householdIndex = 0;
  while (index < config.population) {
    const size = Math.min(
      pattern[householdIndex % pattern.length],
      config.population - index,
    );
    const id = `household-${String(householdIndex).padStart(4, "0")}`,
      regionId = REGIONS[householdIndex % 3];
    const z = normal(world.seeds.population, 0, `${id}:resource`),
      resource = sigmoid(z);
    const parentalEducation = clamp01(
      0.5 +
        0.18 * z +
        0.15 * normal(world.seeds.population, 0, `${id}:parentEducation`),
    );
    const accountId = `account:${id}`;
    world.accounts[accountId] = {
      id: accountId,
      ownerId: id,
      kind: "household",
      balance: Math.round(3000000 * exp(z)),
    };
    const memberIds: string[] = [];
    const kids = size >= 3 ? (size === 5 ? 2 : 1) : 0;
    const childAges = Array.from({ length: kids }, (_, k) =>
      index === 0 && k === 0
        ? 15
        : Math.floor(
            uniform(world.seeds.population, 0, `${id}:child:${k}`) * 25,
          ),
    );
    const parentMin = Math.max(22, ...childAges.map((a) => a + 18));
    const parentAge =
      parentMin +
      Math.floor(
        uniform(world.seeds.population, 0, `${id}:parentAge`) *
          (60 - parentMin),
      );
    for (let slot = 0; slot < size; slot++) {
      const personId = `person-${String(index).padStart(5, "0")}`;
      const age =
        slot < kids
          ? childAges[slot]
          : size === 5 && slot === 4
            ? bounded(parentAge + 20, 60, 89)
            : parentAge;
      world.persons[personId] = createPerson(
        world,
        personId,
        index === 0 ? 15 : age,
        id,
        regionId,
        resource,
        parentalEducation,
        index === 0 ? config.focalName : undefined,
      );
      memberIds.push(personId);
      index++;
    }
    const guardians = memberIds.filter(
      (p) =>
        ageOf(world.persons[p], 0) >= 22 && ageOf(world.persons[p], 0) < 60,
    );
    for (const pid of memberIds.slice(0, kids))
      world.persons[pid].guardianIds = guardians.filter(
        (g) =>
          g !== pid &&
          ageOf(world.persons[g], 0) - ageOf(world.persons[pid], 0) >= 18,
      );
    world.households[id] = {
      id,
      regionId,
      memberIds,
      accountId,
      contributionRate: 0.6,
      careDemand: 0,
      basicNeed: 0,
      lastConsumption: 0,
      shortfall: 0,
      resourceIndex: resource,
      parentalEducation,
    };
    for (let a = 0; a < memberIds.length; a++)
      for (let b = a + 1; b < memberIds.length; b++)
        connect(world, memberIds[a], memberIds[b], true);
    householdIndex++;
  }
  const scale = config.population / 1000;
  for (let i = 0; i < 6; i++) {
    const path = (["university", "vocational", "apprentice"] as const)[
      Math.floor(i / 2)
    ];
    const id = `school-${i}`,
      domain = DOMAINS[i];
    world.accounts[id] = {
      id,
      ownerId: id,
      kind: "school",
      balance: Math.round(10000000 * scale),
    };
    world.schools[id] = {
      id,
      name: [
        "晴川学院",
        "知岸学院",
        "临溪职业院",
        "青屿实作院",
        "木禾工坊",
        "原野学社",
      ][i],
      regionId: REGIONS[i % 3],
      path,
      annualSeats: Math.max(1, Math.round(2 * scale)),
      usedSeats: 0,
      durationMonths: [48, 36, 24][Math.floor(i / 2)],
      annualFee: [600000, 400000, 200000][Math.floor(i / 2)],
      courseWeights: domainWeights(domain),
      quality: 0.7 + 0.2 * uniform(world.seeds.population, 0, `${id}:quality`),
      accountId: id,
      cutoff: [0.35, 0.25, 0.15][Math.floor(i / 2)],
    };
  }
  const investors = Object.values(world.households)
    .sort(
      (a, b) =>
        world.accounts[b.accountId].balance -
          world.accounts[a.accountId].balance || a.id.localeCompare(b.id),
    )
    .slice(0, Math.max(1, Math.ceil(householdIndex * 0.2)));
  for (const [regionIndex, regionId] of REGIONS.entries())
    for (const [domainIndex, domain] of DOMAINS.entries())
      for (let rival = 0; rival < 2; rival++) {
        const id = `firm-${regionIndex}-${domainIndex}-${rival}`;
        const capacity = Math.max(3, Math.round(32 * scale)),
          positionIds: string[] = [];
        let monthlyPayroll = 0;
        for (let j = 0; j < capacity; j++) {
          const grade = (
            j / capacity < 22 / 32 ? 0 : j / capacity < 30 / 32 ? 1 : 2
          ) as 0 | 1 | 2;
          const positionId = `${id}:job:${String(j).padStart(3, "0")}`;
          positionIds.push(positionId);
          monthlyPayroll += WAGES[grade];
          world.positions[positionId] = {
            id: positionId,
            firmId: id,
            domain,
            requirements: domainWeights(domain),
            grade,
            wage: WAGES[grade],
            requiredHours: 160,
            holderId: null,
            enabled: true,
          };
        }
        world.accounts[id] = {
          id,
          ownerId: id,
          kind: "firm",
          balance: monthlyPayroll * 6,
        };
        const ownerIds = Array.from(
          { length: Math.min(3, investors.length) },
          (_, j) => investors[(hash(id) + j) % investors.length].id,
        );
        world.firms[id] = {
          id,
          name: `${["澄序", "原野", "知岸", "木禾", "青屿", "远帆"][domainIndex]}${regionIndex + 1}${rival ? "协作社" : "工作室"}`,
          regionId,
          domain,
          accountId: id,
          positionIds,
          capacity,
          orders: (config.parameters.totalDemand * scale) / 36,
          reputation: 0.5,
          backlog: 0,
          priceIndex: 1,
          policy: {
            punitive: 0.5,
            metricWeight: 0.5,
            evidenceResponse: 0.5,
            credentialWeight: 0.25,
            genderBias: 0,
            ageBias: 0,
          },
          owners: ownerIds.map((householdId) => ({
            householdId,
            share: 1 / ownerIds.length,
          })),
          status: "active",
          arrearsMonths: 0,
          lastProfit: 0,
          annualProfit: 0,
          lastRevenue: 0,
          wagesDue: 0,
          wagesPaid: 0,
          lastOutput: 0,
          turnover: 0,
          administrationHours: 0,
          correctionCost: 0,
          maintenanceTasks: [],
          unpaidWorkHours: 0,
          reinforcement: [],
          revisions: [],
          rewardBaseline: 0,
          version: 0,
          policyLocked: false,
        };
      }
  world.accounts.government = {
    id: "government",
    ownerId: "government",
    kind: "government",
    balance: Math.round(200000000 * scale),
  };
  const eligible = sortedPeople(world)
    .filter((p) => ageOf(p, 0) >= 22 && ageOf(p, 0) < 65)
    .sort(
      (a, b) =>
        uniform(world.seeds.population, 0, `${a.id}:priorJob`) -
          uniform(world.seeds.population, 0, `${b.id}:priorJob`) ||
        a.id.localeCompare(b.id),
    );
  for (const person of eligible) {
    const domain = primaryDomain(person);
    const matches = Object.values(world.positions).filter(
      (p) =>
        p.domain === domain &&
        !p.holderId &&
        p.grade <= Math.floor(person.development.practice[domain] * 3),
    );
    // 地区与已有技能参与期初合成岗位匹配，MBTI 不参与。
    const position = matches
      .sort(
        (a, b) =>
          Number(world.firms[b.firmId].regionId === person.regionId) -
            Number(world.firms[a.firmId].regionId === person.regionId) ||
          a.id.localeCompare(b.id),
      )
      .find(
        (p) =>
          world.firms[p.firmId].positionIds.filter(
            (k) => world.positions[k].holderId,
          ).length < Math.ceil(world.firms[p.firmId].orders),
      );
    if (position) {
      position.holderId = person.id;
      person.employment.positionId = position.id;
      person.employment.lastGrossWage = position.wage;
      person.commitments.push({
        id: `contract:${position.id}`,
        kind: "work",
        hours: 40,
        targetId: position.id,
      });
    }
  }
  const all = sortedPeople(world);
  const degrees = new Map<string, number>();
  for (const person of all) {
    if (ageOf(person, 0) < 15) continue;
    const candidates = all.filter(
      (p) =>
        p.id !== person.id &&
        p.regionId === person.regionId &&
        ageOf(p, 0) >= 15,
    );
    for (let j = 0; j < Math.min(4, candidates.length); j++) {
      const other =
        candidates[
          Math.floor(
            uniform(world.seeds.population, 0, `${person.id}:tie:${j}`) *
              candidates.length,
          )
        ];
      if (
        !world.relations[edgeId(person.id, other.id)] &&
        (degrees.get(person.id) ?? 0) < 24 &&
        (degrees.get(other.id) ?? 0) < 24
      ) {
        connect(world, person.id, other.id);
        degrees.set(person.id, (degrees.get(person.id) ?? 0) + 1);
        degrees.set(other.id, (degrees.get(other.id) ?? 0) + 1);
      }
    }
  }
  if (config.focal) {
    const person = world.persons[world.focalPersonId],
      focal = config.focal;
    if (
      FUNCTIONS.some(
        (k) =>
          !Number.isFinite(focal.jung8[k]) ||
          focal.jung8[k] < 0 ||
          focal.jung8[k] > 100,
      )
    )
      throw new Error("复用的八维画像非法。");
    person.profiles.initialJung8 = { ...focal.jung8 };
    person.profiles.effectiveJung8 = { ...focal.jung8 };
    if (!focal.profileOnly) {
      person.gender = focal.gender;
      if (REGIONS.includes(focal.region)) person.regionId = focal.region;
      const household = world.households[person.householdId];
      household.regionId = person.regionId;
      household.resourceIndex = bounded(focal.familyResources / 100, 0, 1);
      world.accounts[household.accountId].balance = Math.round(
        3000000 * exp((bounded(focal.familyResources, 0, 100) - 50) / 25),
      );
    }
  }
  world.externalSector.openingCash = totalCash(world);
  world.openingAccounts = Object.values(world.accounts)
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((a) => ({
      accountId: a.id,
      amount: a.balance,
      source:
        a.kind === "firm"
          ? "期初外部资本禀赋；股权分配另存于企业 owners，未从家庭现金重复扣减"
          : a.kind === "government" || a.kind === "school"
            ? "期初公共预算禀赋"
            : "期初家庭与个人合成现金禀赋",
    }));
  validateScenarioInputs(world);
  return world;
}
export function checkpoint(world: World): WorldCheckpoint {
  return {
    schemaVersion: 2,
    month: world.month,
    world: structuredClone(world),
  };
}

export function assertWorld(world: World) {
  if (world.schemaVersion !== 2 || world.ruleVersion !== SOCIAL_VERSION)
    throw new Error("世界版本不兼容。");
  validateParameters(world.parameters);
  for (const account of Object.values(world.accounts))
    if (!Number.isSafeInteger(account.balance) || account.balance < 0)
      throw new Error(`账户余额非法：${account.id}`);
  const employed = new Set<string>();
  for (const firm of Object.values(world.firms))
    if (firm.positionIds.length > firm.capacity)
      throw new Error(`机构岗位超容量：${firm.id}`);
  for (const claim of Object.values(world.claims))
    if (
      !Number.isSafeInteger(claim.amount) ||
      claim.amount <= 0 ||
      !world.accounts[claim.debtorAccountId] ||
      (claim.creditorAccountId !== "external" &&
        !world.accounts[claim.creditorAccountId])
    )
      throw new Error("债权金额或账户失效。");
  for (const position of Object.values(world.positions))
    if (position.holderId) {
      const person = world.persons[position.holderId];
      if (
        !person?.alive ||
        person.employment.positionId !== position.id ||
        employed.has(person.id)
      )
        throw new Error(`岗位占用不一致：${position.id}`);
      employed.add(person.id);
    }
  for (const person of Object.values(world.persons)) {
    if (
      !world.households[person.householdId] ||
      !world.accounts[person.cashAccountId]
    )
      throw new Error(`人物归属失效：${person.id}`);
    for (const values of [
      person.development.knowledge,
      person.development.practice,
      person.state.emotions,
      person.state.wellbeing,
    ])
      for (const v of Object.values(values))
        if (!Number.isFinite(v) || v < 0 || v > 1)
          throw new Error(`人物状态越界：${person.id}`);
    for (const k of ["health", "energy", "stress"] as const)
      if (
        !Number.isFinite(person.state[k]) ||
        person.state[k] < 0 ||
        person.state[k] > 1
      )
        throw new Error(`动态状态越界：${person.id}`);
    if (
      Math.abs(mean(Object.values(person.motives)) * NEEDS.length - 1) > 1e-10
    )
      throw new Error("动机权重未归一化。");
    if (
      Object.values(person.monthlyHours).some(
        (h) => !Number.isFinite(h) || h < 0 || h * 2 !== Math.floor(h * 2),
      )
    )
      throw new Error(`工时不符合半小时分辨率：${person.id}`);
    if (
      person.employment.positionId &&
      world.positions[person.employment.positionId]?.holderId !== person.id
    )
      throw new Error("任职引用失效。");
    if (person.employment.positionId && person.education.schoolId)
      throw new Error("同一人不能同时占用全日制岗位和课程。");
    if (
      Object.values(person.monthlyHours).reduce((s, h) => s + h, 0) >
      320 + 1e-9
    )
      throw new Error("人物月度总时间超限。");
    if (
      FUNCTIONS.some((k) => !Number.isFinite(person.profiles.effectiveJung8[k]))
    )
      throw new Error("八维状态非法。");
    for (const scores of [
      person.profiles.initialJung8,
      person.profiles.effectiveJung8,
    ])
      if (FUNCTIONS.some((k) => scores[k] < 0 || scores[k] > 100))
        throw new Error("八维分数越界。");
    for (const scores of [
      person.profiles.initialBig5,
      person.profiles.effectiveBig5,
    ])
      if (
        BIG5.some(
          (k) => !Number.isFinite(scores[k]) || scores[k] < 0 || scores[k] > 1,
        )
      )
        throw new Error("大五分数必须使用 0—1。");
  }
}
