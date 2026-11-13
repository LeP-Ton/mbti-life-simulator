import { DOMAINS, FUNCTIONS } from "../simulation/types";
import { MATRIX } from "./config";
import { monthlyTuition } from "./ledger";
import { pow, ln } from "./numeric";
import {
  betaMean,
  bounded,
  clamp01,
  dot,
  emptyHours,
  informationGain,
  mean,
  newBelief,
  normal,
  roundHours,
  sampleIndex,
  sigmoid,
  softmax,
  sum,
  totalHours,
  uniform,
} from "./math";
import { ageOf, primaryDomain, tickOf } from "./population";
import {
  BIG5,
  NEEDS,
  type ActionKind,
  type ActionPlan,
  type Decision,
  type Domain,
  type Hours,
  type Observation,
  type Parameters,
  type ParameterBundle,
  type Person,
  type PersonalityModel,
  type Vector6,
  type World,
} from "./types";

export function punishmentKey(
  firmId: string,
  channel: "public" | "private",
  confidence: number,
) {
  return `${firmId}/${channel}/${confidence >= 0.7 ? "high" : "low"}/punish`;
}
const observationIndexes = new WeakMap<
  World,
  {
    tick: number;
    relations: Map<string, World["relations"][string][]>;
    issues: Map<string, World["issues"][string]>;
  }
>();
function observationIndex(world: World) {
  const tick = tickOf(world),
    previous = observationIndexes.get(world);
  if (previous?.tick === tick) return previous;
  const relations = new Map<string, World["relations"][string][]>(),
    issues = new Map<string, World["issues"][string]>();
  for (const edge of Object.values(world.relations))
    for (const id of [edge.a, edge.b]) {
      const list = relations.get(id) ?? [];
      list.push(edge);
      relations.set(id, list);
    }
  for (const issue of Object.values(world.issues))
    if (issue.noticed && !issue.resolved && issue.expiresTick >= tick)
      issues.set(issue.personId, issue);
  const index = { tick, relations, issues };
  observationIndexes.set(world, index);
  return index;
}
function courseOffer(
  s: World["schools"][string],
): Observation["schools"][number] {
  return {
    id: s.id,
    fee: monthlyTuition(s.annualFee, 0),
    annualFee: s.annualFee,
    duration: s.durationMonths,
    quality: s.quality,
    path: s.path,
    domain: DOMAINS.reduce(
      (a, d) => (s.courseWeights[d] > s.courseWeights[a] ? d : a),
      DOMAINS[0],
    ),
  };
}
export function observe(world: World, personId: string): Observation {
  const person = world.persons[personId];
  if (!person?.alive)
    throw new Error("不能为不存在或已死亡的人物生成行动观察。");
  const household = world.households[person.householdId],
    position = person.employment.positionId
      ? world.positions[person.employment.positionId]
      : null;
  const firm = position ? world.firms[position.firmId] : null;
  const school = person.education.schoolId
    ? world.schools[person.education.schoolId]
    : null;
  const index = observationIndex(world),
    issue = index.issues.get(personId);
  const knownPositions = Object.keys(person.knownVacancies)
    .sort()
    .filter((id) => person.knownVacancies[id] >= world.month)
    .map((id) => world.positions[id])
    .filter(
      (p) =>
        p &&
        p.enabled &&
        !p.holderId &&
        world.firms[p.firmId].status === "active",
    )
    .map((p) => ({
      id: p.id,
      firmId: p.firmId,
      wage: p.wage,
      grade: p.grade,
      domain: p.domain,
      requirements: { ...p.requirements },
    }));
  const contacts = (index.relations.get(personId) ?? [])
    .filter((e) => world.persons[e.a]?.alive && world.persons[e.b]?.alive)
    .map((e) => ({
      id: e.a === personId ? e.b : e.a,
      trust: betaMean(e.reliability[personId]),
      strength: e.strength,
    }))
    .sort((a, b) => b.strength - a.strength || a.id.localeCompare(b.id))
    .slice(0, 24);
  const confidence = issue?.confidence ?? 0.5;
  const publicP = firm
    ? betaMean(person.beliefs[punishmentKey(firm.id, "public", confidence)])
    : 0.5;
  const privateP = firm
    ? betaMean(person.beliefs[punishmentKey(firm.id, "private", confidence)])
    : 0.5;
  const ownCash = world.accounts[person.cashAccountId].balance,
    householdCash = world.accounts[household.accountId].balance;
  const basicCost = Math.max(
    100000,
    household.basicNeed /
      Math.max(
        1,
        household.memberIds.filter((id) => world.persons[id]?.alive).length,
      ),
  );
  const cashShortfall = clamp01(
    1 -
      (ownCash + householdCash / Math.max(1, household.memberIds.length)) /
        (basicCost * 3),
  );
  const enrolled = [
    "school",
    "university",
    "vocational",
    "apprentice",
  ].includes(person.education.path);
  return {
    tick: tickOf(world),
    month: world.month,
    seed: world.seeds.actions,
    personId,
    personalityModel: world.personalityModel,
    context: `${firm?.id ?? school?.id ?? "community"}/${issue ? "issue" : !position ? "search" : "routine"}`,
    availableHours: roundHours(80 * (0.5 + 0.5 * person.state.health)),
    careHours: roundHours(person.careHours),
    requiredWork: position ? 40 : 0,
    requiredCourse: enrolled ? 40 : 0,
    ownCash,
    householdCash,
    basicCost,
    cashShortfall: household.basicNeed
      ? clamp01(household.shortfall / household.basicNeed)
      : 0,
    domain: position?.domain ?? primaryDomain(person),
    support: school?.quality ?? 0.65,
    wage: position?.wage ?? 0,
    taxRate: world.parameters.wageTax,
    currentFirmId: firm?.id ?? null,
    knownPositions,
    schools: Object.values(world.schools)
      .sort((a, b) => a.id.localeCompare(b.id))
      .filter(
        (s) =>
          ageOf(person, world.month) >= 18 &&
          person.education.path !== "school" &&
          s.id !== person.education.schoolId &&
          !person.development.credentials.some((c) => c.schoolId === s.id) &&
          s.usedSeats < s.annualSeats,
      )
      .map(courseOffer),
    currentCourse: school ? courseOffer(school) : null,
    contacts,
    issue: issue
      ? { id: issue.id, confidence: issue.confidence, firmId: issue.firmId }
      : null,
    punishmentBeliefs: { public: publicP, private: privateP },
    norm: person.personalNorm,
    contextFeatures: [
      1 - Math.abs(publicP - 0.5) * 2,
      1 - person.development.practice[primaryDomain(person)],
      Number(enrolled || !!position),
      cashShortfall,
      Math.min(1, contacts.length / 8),
      issue ? person.values.fairness : 0,
    ],
    canMove:
      household.memberIds.length > 1 &&
      ageOf(person, world.month) >= 18 &&
      ownCash >= world.parameters.housingCost * 3,
  };
}
export function personalityBonus(
  person: Person,
  model: PersonalityModel,
  features: Vector6,
  context: Vector6,
  strength: number,
): number {
  return dot(personalityWeights(person, model, context, strength), features);
}
const NORMALIZED_MATRIX = Object.fromEntries(
  Object.entries(MATRIX).map(([key, row]) => {
    const scale = sum(row.map(Math.abs));
    return [key, row.map((v) => v / scale)];
  }),
);
function personalityWeights(
  person: Person,
  model: PersonalityModel,
  context: Vector6,
  strength: number,
): number[] {
  const weights = [0, 0, 0, 0, 0, 0];
  if (model === "none" || !strength) return weights;
  const keys = model === "jung8" ? [...FUNCTIONS] : [...BIG5];
  const raw: Record<string, number> =
    model === "jung8"
      ? person.profiles.effectiveJung8
      : person.profiles.effectiveBig5;
  const scaleToUnit = model === "jung8" ? 100 : 1;
  const center =
    model === "jung8" ? mean(keys.map((k) => raw[k] / scaleToUnit)) : 0.5;
  for (const k of keys) {
    const z = bounded((raw[k] / scaleToUnit - center) / 0.25, -1, 1),
      row = NORMALIZED_MATRIX[k];
    for (let i = 0; i < 6; i++) weights[i] += z * row[i];
  }
  return weights.map(
    (v, i) => (((v * strength) / keys.length) * (1 + context[i])) / 2,
  );
}
const ALLOCATION_FRACTIONS: Record<
  ActionKind,
  [number, number, number, number, number]
> = {
  deliver: [0.15, 0.35, 0, 0.1, 0.4],
  study: [0.7, 0.15, 0, 0.05, 0.1],
  practice: [0.15, 0.7, 0, 0.05, 0.1],
  search: [0.1, 0.1, 0.6, 0.05, 0.15],
  connect: [0.1, 0.1, 0, 0.6, 0.2],
  recover: [0, 0, 0, 0.1, 0.9],
  public: [0.15, 0.35, 0, 0.2, 0.3],
  private: [0.15, 0.35, 0, 0.15, 0.35],
  verify: [0.3, 0.4, 0, 0.1, 0.2],
  silent: [0.15, 0.35, 0, 0.1, 0.4],
  enrol: [0.3, 0.1, 0.25, 0.1, 0.25],
  move: [0.1, 0.1, 0.1, 0.2, 0.5],
};
function allocate(o: Observation, kind: ActionKind): Hours {
  const h = emptyHours();
  h.care = Math.min(o.availableHours, o.careHours);
  let left = o.availableHours - h.care;
  h.course = Math.min(left, o.requiredCourse);
  left -= h.course;
  h.work = Math.min(left, o.requiredWork);
  left -= h.work;
  const keys = ["study", "practice", "search", "connection", "rest"] as const;
  keys.forEach((key, i) => {
    h[key] = roundHours(left * ALLOCATION_FRACTIONS[kind][i]);
  });
  h.rest += o.availableHours - totalHours(h);
  const expressionCost =
    kind === "public" ? 4 : kind === "private" ? 2 : kind === "verify" ? 6 : 0;
  if (expressionCost) {
    // 表达和核实从恢复与实践中转移真实时间，不额外加出工时。
    let required = expressionCost;
    for (const key of ["rest", "practice", "study"] as const) {
      const n = Math.min(h[key], required);
      h[key] -= n;
      required -= n;
    }
    h.connection += expressionCost - required;
  }
  return h;
}
export function generatePlans(o: Observation, person: Person): ActionPlan[] {
  const ids: ActionKind[] = [
    "deliver",
    "study",
    "practice",
    "connect",
    "recover",
  ];
  if (
    o.knownPositions.length &&
    ageOf(person, o.month) >= 18 &&
    !person.education.schoolId &&
    person.education.path !== "school"
  )
    ids.push("search");
  if (o.issue) ids.push("public", "private", "verify", "silent");
  const affordableSchool = o.schools
    .filter((s) => s.fee <= o.ownCash + o.householdCash)
    .sort(
      (a, b) =>
        educationPreference(o, person, b.id) -
          educationPreference(o, person, a.id) || a.id.localeCompare(b.id),
    )[0];
  if (affordableSchool) ids.push("enrol");
  if (o.canMove) ids.push("move");
  const previous = person.memory.lastHours;
  return ids
    .slice(0, 12)
    .map((id) => {
      const hours = allocate(o, id),
        domain =
          id === "practice" || id === "study"
            ? primaryDomain(person)
            : o.domain;
      const signalBelief =
        person.beliefs[
          o.issue
            ? punishmentKey(o.issue.firmId, "public", o.issue.confidence)
            : "community/reliable"
        ] ?? newBelief(o.tick);
      const features: Vector6 = [
        id === "verify"
          ? informationGain(signalBelief) + 0.4
          : hours.study / 80,
        id === "practice"
          ? 1 - person.development.practice[domain]
          : hours.practice / 160,
        clamp01(
          1 -
            sum(
              (Object.keys(hours) as (keyof Hours)[]).map((k) =>
                Math.abs(hours[k] - previous[k]),
              ),
            ) /
              160,
        ),
        id === "search"
          ? Math.min(1, (o.knownPositions[0]?.wage ?? 0) / (o.basicCost * 4))
          : hours.work / 80,
        clamp01(hours.connection / 24),
        id === "public"
          ? person.values.honesty
          : id === "private"
            ? person.values.boundaries
            : 0.5,
      ];
      const outcomes: Vector6 = [
        bounded(
          ((((o.wage / 4) * hours.work) / 40) * (1 - o.taxRate) -
            (id === "move" ? o.basicCost * 2 : 0)) /
            o.basicCost,
          -1,
          1,
        ),
        clamp01(hours.rest / 40) * 0.5 - o.cashShortfall * 0.25,
        clamp01((hours.study + hours.practice) / 40),
        (hours.rest + hours.connection + hours.practice) / o.availableHours,
        Math.min(1, hours.connection / 20) * (o.contacts.length ? 0.6 : 0.2),
        id === "public"
          ? 0.35
          : id === "private"
            ? 0.2
            : id === "silent"
              ? -0.15
              : 0.05,
      ];
      if (id === "search")
        outcomes[0] += Math.min(
          0.8,
          (Math.max(0, ...o.knownPositions.map((p) => p.wage - o.wage)) /
            (o.basicCost * 6)) *
            (1 - o.taxRate),
        );
      if (id === "verify") {
        outcomes[2] += 0.15;
        outcomes[5] += 0.15;
      }
      if (id === "recover")
        outcomes[1] +=
          (1 - person.state.energy) * 0.5 + person.state.stress * 0.3;
      if (o.issue && (id === "public" || id === "private")) {
        const p = o.punishmentBeliefs[id];
        outcomes[1] -= 0.8 * p;
        outcomes[5] -= 0.4 * p;
      }
      return {
        id,
        hours,
        features: features.map(clamp01) as Vector6,
        outcomes: outcomes.map((v) => bounded(v, -1, 1)) as Vector6,
        domain,
        targetId:
          id === "enrol"
            ? affordableSchool!.id
            : id === "move"
              ? person.householdId
              : id === "search"
                ? (o.knownPositions[0]?.id ?? null)
                : (o.issue?.id ?? null),
        estimatedCost:
          id === "enrol"
            ? affordableSchool!.fee
            : id === "move"
              ? Math.round(o.basicCost * 2)
              : 0,
      };
    })
    .filter(
      (p) =>
        totalHours(p.hours) <= o.availableHours + 1e-8 &&
        Object.values(p.hours).every((h) => h >= 0) &&
        (p.id !== "public" || p.hours.connection >= 4) &&
        (p.id !== "private" || p.hours.connection >= 2) &&
        (p.id !== "verify" || p.hours.connection >= 6) &&
        (p.id !== "connect" || p.hours.connection >= 4) &&
        (p.id !== "study" || p.hours.study >= 0.5) &&
        (p.id !== "practice" || p.hours.practice >= 0.5) &&
        (p.id !== "recover" || p.hours.rest >= 0.5) &&
        (p.id !== "search" || p.hours.search >= 0.5) &&
        (p.id !== "enrol" || p.hours.search >= 0.5) &&
        (p.id !== "move" || p.hours.connection >= 0.5),
    );
}
export function reward(
  person: Person,
  plan: ActionPlan,
  o: Observation,
  parameters: Parameters,
  model: PersonalityModel,
  compiledWeights?: number[],
): number {
  const needValue = NEEDS.reduce(
    (s, k, i) => s + person.motives[k] * plan.outcomes[i],
    0,
  );
  const effort = 1 - plan.hours.rest / o.availableHours;
  const switched =
    sum(
      (Object.keys(plan.hours) as (keyof Hours)[]).map((k) =>
        Math.abs(plan.hours[k] - person.memory.lastHours[k]),
      ),
    ) / 160;
  return (
    needValue +
    dot(
      compiledWeights ??
        personalityWeights(
          person,
          model,
          o.contextFeatures,
          parameters.personalityStrength,
        ),
      plan.features,
    ) -
    0.05 * effort -
    0.05 * switched
  );
}
export function longTermValue(
  o: Observation,
  person: Person,
  schoolId: string,
): number {
  const school = o.schools.find((s) => s.id === schoolId);
  if (!school) return -1;
  const net = (gross: number) => gross - Math.round(gross * o.taxRate);
  const valueOf = (
    course: Observation["schools"][number] | null,
    current = false,
  ) => {
    if (!course) return net(o.wage) * LONG_TERM_ANNUITY[120];
    const completion = clamp01(
        0.2 +
          0.5 * person.development.knowledge[course.domain] +
          0.3 * person.state.energy,
      ),
      wages = o.knownPositions
        .filter((p) => p.domain === course.domain)
        .map((p) => p.wage),
      futureWage = wages.length ? mean(wages) : Math.max(o.wage, 350000);
    const offset = current
        ? Math.max(0, o.month - person.education.startedMonth + 1)
        : 0,
      remaining = Math.min(120, Math.max(0, course.duration - offset));
    let fees = 0;
    for (let m = 1; m <= remaining; m++)
      fees +=
        LONG_TERM_DISCOUNTS[m] *
        monthlyTuition(course.annualFee, offset + m - 1);
    return (
      -fees +
      (completion * net(futureWage) + (1 - completion) * net(o.wage)) *
        (LONG_TERM_ANNUITY[120] - LONG_TERM_ANNUITY[remaining])
    );
  };
  // 减去维持现状的共同基线，包含放弃工资、剩余课程与真实学费；申请当月不重复扣未来学费。
  return bounded(
    (valueOf(school) - valueOf(o.currentCourse, true)) / (120 * o.basicCost),
    -1,
    1,
  );
}
const LONG_TERM_DISCOUNTS = Array.from({ length: 121 }, (_, month) =>
  pow(0.995, month),
);
const LONG_TERM_ANNUITY = LONG_TERM_DISCOUNTS.reduce<number[]>(
  (values, value, i) => {
    values.push(i === 0 ? 0 : values[i - 1] + value);
    return values;
  },
  [],
);
export function educationPreference(
  o: Observation,
  person: Person,
  id: string,
) {
  const school = o.schools.find((s) => s.id === id);
  return school
    ? longTermValue(o, person, id) +
        0.2 * person.interests[school.domain] +
        0.1 * school.quality
    : -Infinity;
}
export function decide(
  o: Observation,
  person: Person,
  bundle: Parameters | ParameterBundle,
  model: PersonalityModel = o.personalityModel,
): Decision {
  const parameters = "parameters" in bundle ? bundle.parameters : bundle;
  const plans = generatePlans(o, person);
  if (!plans.length) throw new Error("未生成任何可行行动。");
  // 每次决策只编译一次画像偏好，所有候选共用；避免在每个候选中重复归一化矩阵。
  const weights = personalityWeights(
    person,
    model,
    o.contextFeatures,
    parameters.personalityStrength,
  );
  const immediate = plans.map(
    (p) =>
      reward(person, p, o, parameters, model, weights) +
      (p.id === "enrol" ? longTermValue(o, person, p.targetId!) : 0),
  );
  const nextIndices = immediate
    .map((value, i) => ({ value, i }))
    .sort(
      (a, b) => b.value - a.value || plans[a.i].id.localeCompare(plans[b.i].id),
    )
    .slice(0, 3)
    .map((v) => v.i);
  const contact = o.contacts[0],
    otherPrior = contact
      ? (person.otherAgentModels[contact.id] ?? [1 / 3, 1 / 3, 1 / 3])
      : [1 / 3, 1 / 3, 1 / 3];
  // 一层对方模型只使用已观察的候选及自己的解释概率，不能读取对方真实画像。
  const cooperationP = PROTOTYPES.reduce(
    (s, motives, k) =>
      s +
      otherPrior[k] *
        (responseProbabilities(motives, plans, {
          person,
          observation: o,
          parameters,
        })[plans.findIndex((p) => p.id === "connect")] ?? 0),
    0,
  );
  const values = plans.map((plan, i) => {
    const publicAction = plan.id === "public" || plan.id === "private";
    const lossP = publicAction
      ? o.punishmentBeliefs[plan.id as "public" | "private"]
      : plan.id === "connect"
        ? 1 - cooperationP
        : o.cashShortfall * 0.3;
    let future = 0;
    // 两种反应分支，局部状态推演；不向规划器暴露社会真实状态。
    for (const [negative, probability] of [
      [false, 1 - lossP],
      [true, lossP],
    ] as const) {
      const futureEnergy = clamp01(
        person.state.energy + (plan.hours.rest / 40 - 0.35) * 0.1,
      );
      const best = Math.max(
        ...nextIndices.map((k) => {
          const candidate = plans[k];
          const securityChange =
            bounded(candidate.outcomes[1] + (negative ? -0.1 : 0.05), -1, 1) -
            candidate.outcomes[1];
          const masteryChange =
            candidate.outcomes[2] *
            ((0.6 + 0.4 * futureEnergy) / (0.6 + 0.4 * person.state.energy) -
              1);
          return (
            immediate[k] +
            person.motives.security * securityChange +
            person.motives.mastery * masteryChange
          );
        }),
      );
      future += probability * best;
    }
    const fear = person.state.emotions.fear,
      anger = person.state.emotions.anger;
    const emotionalCost = publicAction ? 0.08 * fear * lossP : 0;
    const emotionalDrive =
      plan.id === "public" ? 0.04 * anger * person.values.fairness : 0;
    return (
      immediate[i] +
      parameters.discount * future -
      parameters.riskAversion * lossP * (1 - lossP) -
      emotionalCost +
      emotionalDrive
    );
  });
  const logits = values.map(
    (v, i) =>
      v / parameters.temperature +
      (parameters.habitLearning
        ? (person.habits[`${o.context}/${plans[i].id}`] ?? 0) +
          0.2 *
            (person.habits[
              `general/${o.issue ? "issue" : "routine"}/${plans[i].id}`
            ] ?? 0)
        : 0),
  );
  // 每个候选独立的 Gumbel 扰动，新增无关候选不移动其他候选的随机键。
  const selectedIndex = logits
    .map((v, i) => ({
      i,
      value:
        v -
        ln(
          -ln(
            uniform(
              o.seed,
              o.month,
              `${person.id}/${o.tick % 4}/choice/${plans[i].id}`,
            ),
          ),
        ),
    }))
    .sort(
      (a, b) => b.value - a.value || plans[a.i].id.localeCompare(plans[b.i].id),
    )[0].i;
  const probabilities = softmax(logits);
  return {
    personId: person.id,
    tick: o.tick,
    context: o.context,
    selected: structuredClone(plans[selectedIndex]),
    candidates: plans.map((plan, i) => ({
      plan,
      value: values[i],
      probability: probabilities[i],
    })),
    probability: probabilities[selectedIndex],
    expectedReward: immediate[selectedIndex],
  };
}
export const PROTOTYPES = [
  [0.2, 0.1, 0.4, 0.1, 0.1, 0.1],
  [0.2, 0.45, 0.1, 0.1, 0.1, 0.05],
  [0.15, 0.1, 0.1, 0.15, 0.4, 0.1],
] as const;
interface ResponseContext {
  person: Person;
  observation: Observation;
  parameters: Parameters;
}
function responseProbabilities(
  motives: readonly number[],
  plans: ActionPlan[],
  context: ResponseContext,
) {
  const hypothetical = {
    ...context.person,
    motives: Object.fromEntries(
      NEEDS.map((key, i) => [key, motives[i]]),
    ) as Person["motives"],
  };
  // 一层推理的边界使用同一奖励函数与概率选择器作一步反应；不假装知道他人的画像或策略。
  return softmax(
    plans.map(
      (plan) =>
        reward(
          hypothetical,
          plan,
          context.observation,
          context.parameters,
          "none",
          [0, 0, 0, 0, 0, 0],
        ) / context.parameters.temperature,
    ),
  );
}
export function inferOther(
  prior: [number, number, number],
  chosen: ActionKind,
  candidates: Decision["candidates"],
  context: ResponseContext,
): [number, number, number] {
  const likelihood = PROTOTYPES.map((motives) => {
    const probabilities = responseProbabilities(
      motives,
      candidates.map((c) => c.plan),
      context,
    );
    return (
      probabilities[candidates.findIndex((c) => c.plan.id === chosen)] ?? 1e-8
    );
  });
  const weights = prior.map((p, i) => p * Math.max(1e-8, likelihood[i])),
    total = sum(weights);
  return weights.map((p) => p / total) as [number, number, number];
}
