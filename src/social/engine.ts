import { DOMAINS } from "../simulation/types";
import { domainWeights, SOCIAL_VERSION, validateParameters } from "./config";
import { decide, inferOther, observe, punishmentKey, reward } from "./decision";
import {
  appraise,
  consolidate,
  learn,
  remember,
  updateState,
  decayEmotions,
} from "./evolution";
import {
  assignCare,
  considerEntrants,
  evolveInstitutions,
  settleEconomy,
} from "./economy";
import {
  accountingError,
  cash,
  totalCash,
  transfer,
  recordedTransfer,
} from "./ledger";
import {
  admit,
  announceVacancies,
  applyAppointments,
  recruit,
  refreshOrders,
  type Emit,
} from "./markets";
import {
  addHours,
  annualToMonthly,
  betaMean,
  bounded,
  clamp01,
  dot,
  emptyHours,
  logit,
  mean,
  newBelief,
  normal,
  quantile,
  roundHours,
  sigmoid,
  sum,
  taskQuality,
  teamQuality,
  uniform,
  updateBeta,
} from "./math";
import {
  ageOf,
  assertWorld,
  connect,
  createPerson,
  edgeId,
  primaryDomain,
  sortedPeople,
  tickOf,
} from "./population";
import {
  NEEDS,
  type Decision,
  type Intervention,
  type LedgerEntry,
  type Metrics,
  type Observation,
  type Person,
  type StepResult,
  type Vector6,
  type World,
  type WorldCheckpoint,
  type WorldEvent,
} from "./types";
import { applyMacroInputs, sampleExogenousEvents } from "./exogenous";
import { consumeMaintenance, scheduleMaintenance } from "./maintenance";
import { pow } from "./numeric";

export function createEmitter(
  world: World,
  events: WorldEvent[],
  capture = true,
): Emit {
  return (kind, title, actors, truth, observations = {}, costs = {}) => {
    const sequence = ++world.eventSequence;
    const event: WorldEvent = {
      id: `event:${sequence}`,
      sequence,
      month: world.month,
      substep: world.substep,
      kind,
      title,
      actorIds: [...new Set(actors)].sort(),
      causeIds: costs.causes ?? [],
      truth,
      observations: Object.fromEntries(
        Object.entries(observations).filter(
          ([id]) => world.persons[id]?.alive || kind === "death",
        ),
      ),
      hours: costs.hours ?? 0,
      money: costs.money ?? 0,
      ruleId: `${SOCIAL_VERSION}/${kind}`,
    };
    if (capture) events.push(event);
    return event;
  };
}
function leaveEmployment(world: World, person: Person, reason: string) {
  if (person.employment.positionId) {
    const position = world.positions[person.employment.positionId];
    position.holderId = null;
    world.firms[position.firmId].turnover++;
    world.counters.separations++;
    person.employment.positionId = null;
    person.employment.searchMonths = 0;
    person.employment.leaveReason = reason;
  }
  person.commitments = person.commitments.filter((c) => c.kind !== "work");
}
function demographicUpdate(world: World, ledger: LedgerEntry[], emit: Emit) {
  const p = world.parameters;
  const external = new Map(
    sampleExogenousEvents(world).map((e) => [`${e.kind}/${e.targetId}`, e]),
  );
  for (const person of sortedPeople(world)) {
    if (!person.alive) continue;
    const age = ageOf(person, world.month),
      band =
        age < 15
          ? 0
          : age < 40
            ? 1
            : age < 60
              ? 2
              : age < 75
                ? 3
                : age < 90
                  ? 4
                  : 5;
    if (external.has(`death/${person.id}`)) {
      person.alive = false;
      person.diedMonth = world.month;
      leaveEmployment(world, person, "外生死亡事件");
      person.commitments = [];
      person.monthlyHours = emptyHours();
      person.employment.workHours = 0;
      person.employment.productiveHours = 0;
      person.employment.attemptedTasks = 0;
      person.employment.successfulTasks = 0;
      if (person.education.schoolId) person.education.schoolId = null;
      world.pendingEvents = world.pendingEvents.filter(
        (e) => e.personId !== person.id,
      );
      for (const issue of Object.values(world.issues))
        if (issue.personId === person.id) delete world.issues[issue.id];
      const event = emit(
        "death",
        "人物行动停止，经历与应收款继续保留",
        [person.id],
        { age, externalRisk: true },
        { [person.id]: { ended: true } },
      );
      transfer(
        world,
        ledger,
        person.cashAccountId,
        world.households[person.householdId].accountId,
        cash(world, person.cashAccountId),
        "遗留资产归家庭",
        event.id,
      );
      continue;
    }
    person.state.health = clamp01(person.state.health + 0.02);
    if (external.has(`health/${person.id}`)) {
      const loss = external.get(`health/${person.id}`)!.severity ?? 0.2;
      person.state.health = clamp01(person.state.health - loss);
      emit(
        "health",
        "健康变化减少了本月可安排时间",
        [person.id],
        { loss, health: person.state.health },
        { [person.id]: { health: person.state.health } },
      );
    }
    if (age >= 18 && person.education.path === "school") {
      person.education.path = "none";
      person.education.level = Math.max(1, person.education.level);
      person.commitments = person.commitments.filter(
        (c) => c.kind !== "course",
      );
    }
    if (age >= 15 && age < 18 && person.education.path === "none")
      person.education.path = "school";
    if (
      age >= 15 &&
      age < 18 &&
      person.education.path === "school" &&
      !person.commitments.some((c) => c.kind === "course")
    )
      person.commitments.push({
        id: `basic-course:${person.id}`,
        kind: "course",
        hours: 40,
        targetId: `basic-school:${person.regionId}`,
      });
    person.monthlyHours = emptyHours();
    person.employment.workHours = 0;
    person.employment.productiveHours = 0;
    person.employment.qualitySum = 0;
    person.employment.qualityCount = 0;
    person.employment.attemptedTasks = 0;
    person.employment.successfulTasks = 0;
    if (
      !person.employment.positionId &&
      age >= 18 &&
      !person.education.schoolId
    )
      person.employment.searchMonths++;
    if (external.has(`migration/${person.id}`)) {
      const next =
        external.get(`migration/${person.id}`)!.regionId ?? person.regionId;
      const event = emit(
        "migration",
        "外生迁移改变了可接触的地区信息",
        [person.id],
        { from: person.regionId, to: next },
        { [person.id]: { region: next } },
      );
      person.regionId = next;
      person.knownVacancies = {};
      // 迁移支出来自已有现金；支付不足会记录为消费缓冲减少，不制造负余额。
      transfer(
        world,
        ledger,
        person.cashAccountId,
        "external",
        Math.min(
          cash(world, person.cashAccountId),
          world.parameters.housingCost,
        ),
        "迁移成本",
        event.id,
      );
    }
  }
  for (const household of Object.values(world.households).sort((a, b) =>
    a.id.localeCompare(b.id),
  )) {
    const guardians = household.memberIds
      .map((id) => world.persons[id])
      .filter(
        (v) =>
          v?.alive &&
          ageOf(v, world.month) >= 20 &&
          ageOf(v, world.month) <= 40,
      );
    if (
      !guardians.length ||
      household.memberIds.filter(
        (id) =>
          world.persons[id]?.alive &&
          ageOf(world.persons[id], world.month) < 18,
      ).length >= 3
    )
      continue;
    if (!external.has(`birth/${household.id}`)) continue;
    const id = `born:${household.id}:${world.month}`;
    world.personSequence++;
    const newborn = createPerson(
      world,
      id,
      0,
      household.id,
      household.regionId,
      household.resourceIndex,
      household.parentalEducation,
    );
    // 新生儿没有凭空获得个人现金；其期初资金通过家庭转移明确记账。
    world.accounts[newborn.cashAccountId].balance = 0;
    newborn.guardianIds = guardians.map((g) => g.id);
    newborn.education.path = "none";
    world.persons[id] = newborn;
    household.memberIds.push(id);
    for (const member of household.memberIds)
      if (member !== id) connect(world, id, member, true);
    emit(
      "birth",
      "家庭增加一名成员，照料与生活支出随之变化",
      [id, ...newborn.guardianIds],
      { householdId: household.id },
      { [id]: { born: true } },
    );
  }
  if (world.month % 12 === 1)
    for (const school of Object.values(world.schools)) school.usedSeats = 0;
}
function applyInterventions(world: World, emit: Emit) {
  for (const intervention of world.interventionHistory
    .filter((i) => i.fromMonth === world.month)
    .sort((a, b) => a.id.localeCompare(b.id))) {
    if (intervention.parameters) {
      Object.assign(world.parameters, structuredClone(intervention.parameters));
      validateParameters(world.parameters);
      world.government.wageTax = world.parameters.wageTax;
      world.government.profitTax = world.parameters.profitTax;
    }
    for (const firm of Object.values(world.firms))
      if (!intervention.firmIds || intervention.firmIds.includes(firm.id)) {
        if (intervention.punitive !== undefined)
          firm.policy.punitive = intervention.punitive;
        if (intervention.lockPolicy !== undefined)
          firm.policyLocked = intervention.lockPolicy;
      }
    emit("intervention", "预先登记的社会干预开始生效", [], {
      interventionId: intervention.id,
      fromMonth: intervention.fromMonth,
      punitive: intervention.punitive ?? -1,
    });
  }
}
function spawnIssues(world: World, people: Person[]) {
  const tick = tickOf(world);
  const existing = new Set(
    Object.values(world.issues)
      .filter((i) => !i.resolved && i.expiresTick >= tick)
      .map((i) => i.personId),
  );
  for (const person of people) {
    const position = person.employment.positionId
      ? world.positions[person.employment.positionId]
      : null;
    if (
      !position ||
      existing.has(person.id) ||
      uniform(
        world.seeds.shocks,
        world.month,
        `issue/${tick % 4}/${person.id}`,
      ) >= world.parameters.issueRate
    )
      continue;
    const firm = world.firms[position.firmId],
      knowledge = person.development.knowledge[position.domain];
    const realDefect =
      uniform(
        world.seeds.shocks,
        world.month,
        `defect/${tick % 4}/${position.id}`,
      ) < clamp01(0.45 + firm.backlog * 0.3 - knowledge * 0.15);
    const noticed =
      uniform(
        world.seeds.shocks,
        world.month,
        `notice/${tick % 4}/${person.id}`,
      ) <
      (realDefect
        ? sigmoid(
            (knowledge +
              0.5 * person.development.practice[position.domain] -
              0.4) *
              3,
          )
        : 0.1 * (1 - knowledge));
    const id = `issue:${tick}:${person.id}`;
    world.issues[id] = {
      id,
      firmId: firm.id,
      personId: person.id,
      createdTick: tick,
      expiresTick: tick + 3,
      realDefect,
      noticed,
      confidence: clamp01(
        0.4 +
          0.5 * knowledge +
          0.15 *
            uniform(
              world.seeds.shocks,
              world.month,
              `confidence/${tick % 4}/${person.id}`,
            ),
      ),
      resolved: false,
    };
    if (noticed) {
      world.counters.observedOpportunities++;
      person.memory.observedOpportunities++;
    }
    if (realDefect) world.counters.defects++;
  }
}
function expression(
  world: World,
  person: Person,
  decision: Decision,
  o: Observation,
  emit: Emit,
) {
  const plan = decision.selected,
    issue = o.issue ? world.issues[o.issue.id] : null;
  if (!issue) return { reward: decision.expectedReward, forcedHours: 0 };
  const firm = world.firms[issue.firmId];
  if (plan.id === "verify") {
    const result =
      uniform(
        world.seeds.feedback,
        world.month,
        `verify/${decision.tick}/${person.id}`,
      ) <
      0.5 + 0.5 * person.development.knowledge[plan.domain];
    if (result) {
      if (issue.realDefect) issue.confidence = 0.95;
      else issue.resolved = true;
    }
    emit(
      "verification",
      "用实际时间补充证据",
      [person.id],
      { issueId: issue.id, realDefect: issue.realDefect, verified: result },
      { [person.id]: { verified: result, confidence: issue.confidence } },
      { hours: 6 },
    );
    return {
      reward: decision.expectedReward + (result ? 0.05 : 0),
      forcedHours: 0,
    };
  }
  if (plan.id !== "public" && plan.id !== "private") {
    if (plan.id === "silent" || decision.tick >= issue.expiresTick) {
      person.memory.silentReports++;
      world.counters.silentReports++;
      issue.resolved = true;
      const event = emit(
        "silence",
        "这次问题被暂缓表达",
        [person.id],
        { issueId: issue.id, realDefect: issue.realDefect },
        { [person.id]: { confidence: issue.confidence } },
      );
      if (issue.realDefect)
        world.pendingEvents.push({
          id: `repair:${issue.id}`,
          dueMonth: world.month + 2,
          kind: "repair",
          targetId: firm.id,
          causeId: event.id,
          payload: { hours: 8 },
        });
    }
    return { reward: decision.expectedReward, forcedHours: 0 };
  }
  const channel = plan.id;
  const assessment =
    uniform(world.seeds.feedback, world.month, `assessment/${issue.id}`) <
    world.parameters.assessmentAccuracy
      ? issue.realDefect
      : !issue.realDefect;
  const pPunish = sigmoid(
    -1 +
      logit(firm.policy.punitive) +
      1.5 * firm.policy.metricWeight +
      Number(channel === "public") -
      3 * Number(assessment),
  );
  const punished =
    uniform(
      world.seeds.feedback,
      world.month,
      `punishment/${issue.id}/${channel}`,
    ) < pPunish;
  const pFix = sigmoid(
    -2 +
      4 * Number(assessment) +
      2 * firm.policy.evidenceResponse -
      firm.backlog,
  );
  const canInspect = firm.administrationHours + 2 <= 160;
  const investigated =
    canInspect &&
    uniform(world.seeds.feedback, world.month, `fix/${issue.id}`) < pFix;
  if (canInspect) firm.administrationHours += 2;
  if (channel === "public") {
    person.memory.publicReports++;
    world.counters.publicReports++;
  } else {
    person.memory.privateReports++;
    world.counters.privateReports++;
  }
  if (issue.realDefect) {
    person.memory.validReports++;
    world.counters.validReports++;
  } else {
    person.memory.invalidReports++;
    world.counters.invalidReports++;
  }
  const oldEstimate = o.punishmentBeliefs[channel];
  world.counters.punishmentSquaredError += (oldEstimate - pPunish) ** 2;
  world.counters.beliefSamples++;
  const event = emit(
    "expression",
    `${channel === "public" ? "公开提出" : "私下沟通"}后的组织回应`,
    [person.id],
    {
      firmId: firm.id,
      issueId: issue.id,
      valid: issue.realDefect,
      assessment,
      punished,
      pPunish,
      investigated,
      estimated: oldEstimate,
    },
    {
      [person.id]: {
        channel,
        punished,
        investigated,
        confidence: issue.confidence,
      },
    },
    { hours: channel === "public" ? 4 : 2 },
  );
  if (world.parameters.beliefLearning) {
    const key = punishmentKey(firm.id, channel, issue.confidence);
    person.beliefs[key] = updateBeta(
      person.beliefs[key] ?? newBelief(decision.tick),
      punished,
      decision.tick,
      event.sequence,
      world.parameters.beliefHalfLifeMonths,
    );
  }
  if (canInspect)
    scheduleMaintenance(firm, {
      id: `inspect:${issue.id}`,
      remaining: 2,
      total: 2,
      realDefect: false,
      causeId: event.id,
    });
  if (investigated) {
    const hours = issue.realDefect ? 4 : 2;
    scheduleMaintenance(firm, {
      id: `fix:${issue.id}`,
      remaining: hours,
      total: hours,
      realDefect: issue.realDefect,
      causeId: event.id,
      reporterId: person.id,
    });
  } else if (issue.realDefect)
    world.pendingEvents.push({
      id: `repair:${issue.id}`,
      dueMonth: world.month + 2,
      kind: "repair",
      targetId: firm.id,
      causeId: event.id,
      payload: { hours: 8 },
    });
  issue.resolved = true;
  firm.reinforcement.push({
    action: Number(punished),
    probability: pPunish,
    eventId: event.id,
  });
  person.state.wellbeing.fairness = clamp01(
    0.9 * person.state.wellbeing.fairness +
      0.1 * (punished ? 1 - issue.confidence : issue.confidence),
  );
  appraise(
    person,
    punished ? -0.6 : investigated ? 0.35 : 0.05,
    punished ? -issue.confidence : 0.5,
    1,
    oldEstimate,
    0.5,
    world.parameters,
  );
  const forcedHours = punished ? 4 : 0;
  let remaining = forcedHours;
  for (const key of ["rest", "practice", "study"] as const) {
    const n = Math.min(plan.hours[key], remaining);
    plan.hours[key] -= n;
    remaining -= n;
  }
  const extraHours = forcedHours - remaining;
  // 余暇不足时，处罚占用本来有薪的工作时间；不能因时间已排满而免除实际代价。
  const convertedPaidHours = Math.min(plan.hours.work, remaining);
  remaining -= convertedPaidHours;
  const actualUnpaidHours = forcedHours - remaining;
  plan.hours.work += extraHours;
  firm.unpaidWorkHours += actualUnpaidHours;
  event.truth.unpaidHours = actualUnpaidHours;
  event.truth.convertedPaidHours = convertedPaidHours;
  const ownFeedback = event.observations[person.id];
  if (ownFeedback) {
    ownFeedback.unpaidHours = actualUnpaidHours;
    ownFeedback.convertedPaidHours = convertedPaidHours;
  }
  const penalty = Number(punished) - oldEstimate;
  return {
    reward:
      decision.expectedReward -
      0.8 * penalty * person.motives.security -
      0.4 * penalty * person.motives.fairness,
    forcedHours: actualUnpaidHours,
  };
}
function workAndLearn(
  world: World,
  person: Person,
  decision: Decision,
  o: Observation,
  forcedHours: number,
  emit: Emit,
) {
  let taskReward = 0;
  const h = decision.selected.hours,
    domain = decision.selected.domain;
  const position = person.employment.positionId
    ? world.positions[person.employment.positionId]
    : null;
  const firm = position ? world.firms[position.firmId] : null;
  const paidWork = Math.max(0, h.work - forcedHours),
    maintenance = firm
      ? consumeMaintenance(world, firm, paidWork, person.id, emit)
      : 0;
  const productive = Math.max(0, paidWork - maintenance);
  if (position) {
    const knowledge = DOMAINS.reduce(
      (s, d) => s + position.requirements[d] * person.development.knowledge[d],
      0,
    );
    const practice = DOMAINS.reduce(
      (s, d) => s + position.requirements[d] * person.development.practice[d],
      0,
    );
    const quality = taskQuality({
      knowledge,
      practice,
      energy: person.state.energy,
      hours: productive,
      requiredHours: 40,
      disturbance: normal(
        world.seeds.shocks,
        world.month,
        `task/${position.id}/${world.substep}`,
      ),
    });
    let success: boolean | undefined;
    if (productive > 0) {
      const difficulty = 0.2 + 0.2 * position.grade,
        pSuccess = sigmoid((quality - difficulty) / 0.1);
      success =
        uniform(
          world.seeds.shocks,
          world.month,
          `task-success/${position.id}/${world.substep}`,
        ) < pSuccess;
      person.employment.attemptedTasks++;
      person.employment.successfulTasks += Number(success);
      world.counters.taskAttempts++;
      world.counters.taskSuccesses += Number(success);
      appraise(
        person,
        success ? 0.25 : -0.25,
        success ? 0.5 : 0,
        0,
        0,
        0,
        world.parameters,
      );
      taskReward = 0.15 * (Number(success) - pSuccess) * person.motives.mastery;
      emit(
        "task-result",
        success ? "本次任务达到质量要求" : "本次任务未达到质量要求",
        [person.id],
        { quality, difficulty, pSuccess, success, firmId: position.firmId },
        { [person.id]: { quality, difficulty, pSuccess, success } },
        { hours: productive },
      );
    }
    person.employment.workHours += paidWork;
    person.employment.productiveHours += productive;
    person.employment.qualitySum += quality;
    person.employment.qualityCount++;
    person.employment.contributions += (quality * productive) / 160;
    if (
      world.substep === 3 &&
      world.month % 3 === 0 &&
      person.employment.productiveHours > 0
    ) {
      const id = `work:${world.month}:${person.id}`;
      const monthlyQuality =
        person.employment.qualitySum / person.employment.qualityCount;
      const monthlyProductiveHours = person.employment.productiveHours;
      person.development.works.push({
        id,
        month: world.month,
        domain: position.domain,
        quality: monthlyQuality,
        contribution: (monthlyQuality * monthlyProductiveHours) / 160,
        success,
      });
      person.memory.totalWorks++;
      if (person.development.works.length > 24)
        person.development.works.shift();
      emit(
        "work-evidence",
        "实际交付进入作品与贡献记录",
        [person.id],
        {
          quality: monthlyQuality,
          productiveHours: monthlyProductiveHours,
          firmId: position.firmId,
        },
        {
          [person.id]: {
            quality: monthlyQuality,
            productiveHours: monthlyProductiveHours,
          },
        },
        { hours: monthlyProductiveHours },
      );
    }
  }
  const school = person.education.schoolId
    ? world.schools[person.education.schoolId]
    : null;
  learn(
    person,
    { ...h, work: paidWork },
    domain,
    school?.courseWeights ?? domainWeights(person.education.domain),
    o.support,
    world.parameters,
  );
  person.memory.totalWorkHours += forcedHours;
  if (person.education.schoolId) person.education.credits += h.course / 160;
  addHours(person.monthlyHours, h);
  if (
    sum(Object.values(h)) > o.availableHours + 1e-9 ||
    Object.values(h).some((v) => v < 0 || v * 2 !== Math.floor(v * 2))
  )
    throw new Error(`工时约束失败：${person.id}`);
  return taskReward;
}
function socialInteractions(
  world: World,
  decisions: Map<string, Decision>,
  observations: Map<string, Observation>,
  emit: Emit,
  sharedJobs: Map<string, Set<string>>,
) {
  const receivedSupport = new Map<string, number>();
  const budgets = new Map(
    [...decisions].map(([id, d]) => [id, d.selected.hours.connection]),
  );
  const index = new Map<string, World["relations"][string][]>();
  for (const edge of Object.values(world.relations))
    for (const id of [edge.a, edge.b]) {
      const rows = index.get(id) ?? [];
      rows.push(edge);
      index.set(id, rows);
    }
  const proposals: { a: string; b: string; priority: number }[] = [];
  for (const [id, decision] of decisions)
    if (decision.selected.id === "connect" && (budgets.get(id) ?? 0) >= 4) {
      const contacts = observations.get(id)!.contacts;
      const chosen = contacts.slice(
        0,
        Math.min(3, Math.floor((budgets.get(id) ?? 0) / 4)),
      );
      for (const c of chosen)
        proposals.push({
          a: id,
          b: c.id,
          priority: uniform(
            world.seeds.feedback,
            world.month,
            `social-priority/${world.substep}/${edgeId(id, c.id)}`,
          ),
        });
      if (chosen.length < 2) {
        const candidates = [...decisions.keys()]
          .filter(
            (pid) =>
              pid !== id &&
              world.persons[pid].regionId === world.persons[id].regionId,
          )
          .sort();
        if (candidates.length) {
          const b =
            candidates[
              Math.floor(
                uniform(
                  world.seeds.actions,
                  world.month,
                  `meet/${world.substep}/${id}`,
                ) * candidates.length,
              )
            ];
          proposals.push({
            a: id,
            b,
            priority: uniform(
              world.seeds.feedback,
              world.month,
              `social-priority/${world.substep}/${edgeId(id, b)}`,
            ),
          });
        }
      }
    }
  const seen = new Set<string>();
  for (const pair of proposals.sort(
    (a, b) =>
      a.priority - b.priority ||
      edgeId(a.a, a.b).localeCompare(edgeId(b.a, b.b)),
  )) {
    const key = edgeId(pair.a, pair.b);
    if (seen.has(key)) continue;
    seen.add(key);
    const a = world.persons[pair.a],
      b = world.persons[pair.b],
      da = decisions.get(a.id),
      db = decisions.get(b.id);
    if (!a.alive || !b.alive || !da || !db || (budgets.get(a.id) ?? 0) < 4)
      continue;
    let edge = world.relations[key];
    const willing =
      (budgets.get(b.id) ?? 0) >= 4 && db.selected.id === "connect";
    const event = emit(
      "invitation",
      willing ? "双方为一次合作留出时间" : "对方暂时没有可用的合作时间",
      [a.id, b.id],
      { accepted: willing },
      { [a.id]: { accepted: willing }, [b.id]: { accepted: willing } },
      { hours: willing ? 8 : 2 },
    );
    budgets.set(a.id, (budgets.get(a.id) ?? 0) - (willing ? 4 : 2));
    if (edge && world.parameters.beliefLearning)
      edge.willingness[a.id] = updateBeta(
        edge.willingness[a.id],
        willing,
        tickOf(world),
        event.sequence,
        world.parameters.beliefHalfLifeMonths,
      );
    if (!willing) continue;
    budgets.set(b.id, (budgets.get(b.id) ?? 0) - 4);
    if (!edge) {
      const degree = (id: string) =>
        (index.get(id) ?? []).filter((e) => !e.family).length;
      const coLocation = Number(a.regionId === b.regionId),
        similarity =
          1 -
          Math.abs(
            a.interests[primaryDomain(a)] - b.interests[primaryDomain(a)],
          );
      const pLink = sigmoid(
        -2 +
          1.5 * coLocation +
          1 +
          similarity -
          Math.max(degree(a.id), degree(b.id)) / 24,
      );
      if (
        degree(a.id) >= 24 ||
        degree(b.id) >= 24 ||
        uniform(
          world.seeds.feedback,
          world.month,
          `link/${world.substep}/${key}`,
        ) >= pLink
      )
        continue;
      connect(world, a.id, b.id);
      edge = world.relations[key];
      for (const id of [a.id, b.id]) {
        const rows = index.get(id) ?? [];
        rows.push(edge);
        index.set(id, rows);
      }
    }
    edge.strength = clamp01(edge.strength + 0.04);
    edge.lastContactTick = tickOf(world);
    const domain = da.selected.domain,
      req = domainWeights(domain),
      members = [a, b].map((p) => ({
        knowledge: p.development.knowledge,
        practice: p.development.practice,
        energy: p.state.energy,
      }));
    const quality = teamQuality(members, req, 4),
      contributions = members.map(
        (_, i) =>
          quality -
          teamQuality(
            members.filter((__, j) => j !== i),
            req,
            2,
          ),
      );
    // 外界按可见学历信号分配记功；操作性贡献是移除成员后的质量差，两者独立保存。
    const creditWeights = [a, b].map(
        (p, i) =>
          Math.max(0.01, contributions[i]) * (1 + 0.25 * p.education.level),
      ),
      creditTotal = sum(creditWeights);
    const fulfilled =
      uniform(
        world.seeds.feedback,
        world.month,
        `cooperation/${world.substep}/${key}`,
      ) < sigmoid((quality - 0.15) / 0.1);
    const cooperation = emit(
      "collaboration",
      "合作交付、操作贡献与外界记功分别记录",
      [a.id, b.id],
      {
        quality,
        fulfilled,
        domain,
        contributionA: contributions[0],
        contributionB: contributions[1],
        creditA: creditWeights[0] / creditTotal,
        creditB: creditWeights[1] / creditTotal,
      },
      {
        [a.id]: {
          quality,
          fulfilled,
          contribution: contributions[0],
          externalCredit: creditWeights[0] / creditTotal,
        },
        [b.id]: {
          quality,
          fulfilled,
          contribution: contributions[1],
          externalCredit: creditWeights[1] / creditTotal,
        },
      },
      { hours: 8, causes: [event.id] },
    );
    for (const [observer, other, ownDecision, i] of [
      [a, b, da, 0],
      [b, a, db, 1],
    ] as const) {
      if (world.parameters.beliefLearning) {
        edge.reliability[observer.id] = updateBeta(
          edge.reliability[observer.id],
          fulfilled,
          tickOf(world),
          cooperation.sequence,
          world.parameters.beliefHalfLifeMonths,
        );
        // 仅用观察者自己的可见候选模拟对方，不读取对方的真实偏好或信念。
        observer.otherAgentModels[other.id] = inferOther(
          observer.otherAgentModels[other.id] ?? [1 / 3, 1 / 3, 1 / 3],
          "connect",
          ownDecision.candidates,
          {
            person: observer,
            observation: observations.get(observer.id)!,
            parameters: world.parameters,
          },
        );
      }
      observer.state.wellbeing.belonging = clamp01(
        observer.state.wellbeing.belonging + (fulfilled ? 0.04 : -0.02),
      );
      if (fulfilled)
        receivedSupport.set(
          observer.id,
          Math.min(1, (receivedSupport.get(observer.id) ?? 0) + 0.4),
        );
      observer.development.works.push({
        id: `${cooperation.id}:${observer.id}`,
        domain,
        quality,
        month: world.month,
        contribution: contributions[i],
        externalCredit: creditWeights[i] / creditTotal,
      });
      observer.memory.totalWorks++;
      if (observer.development.works.length > 24)
        observer.development.works.shift();
      appraise(
        observer,
        fulfilled ? 0.2 : -0.2,
        fulfilled ? 0.4 : -0.4,
        1,
        0,
        0,
        world.parameters,
      );
      const source = other.knownVacancies,
        sent = sharedJobs.get(other.id) ?? new Set<string>();
      sharedJobs.set(other.id, sent);
      for (const vacancy of Object.keys(source).sort())
        if (
          source[vacancy] >= world.month &&
          !observer.knownVacancies[vacancy] &&
          (sent.has(vacancy) || sent.size < 3)
        ) {
          observer.knownVacancies[vacancy] = source[vacancy];
          sent.add(vacancy);
          emit(
            "vacancy-information",
            "联系人转交了一条已知岗位信息",
            [observer.id, other.id],
            { sender: other.id, receiver: observer.id, positionId: vacancy },
            {
              [observer.id]: { positionId: vacancy, source: other.id },
              [other.id]: { positionId: vacancy },
            },
            { causes: [cooperation.id] },
          );
        }
      observer.personalNorm = clamp01(
        0.98 * observer.personalNorm +
          0.02 * Number(other.memory.lastAction === "public"),
      );
    }
  }
  return receivedSupport;
}
function educationCompletion(world: World, ledger: LedgerEntry[], emit: Emit) {
  for (const person of sortedPeople(world))
    if (person.alive && person.education.schoolId) {
      const school = world.schools[person.education.schoolId],
        edu = person.education;
      const attendance = person.monthlyHours.course / 160;
      edu.attendance = attendance;
      if (attendance < 0.8)
        emit(
          "course-absence",
          "本月实际课程出勤不足",
          [person.id],
          { schoolId: school.id, attendance },
          {
            [person.id]: {
              attendance,
              missingHours: 160 - person.monthlyHours.course,
            },
          },
        );
      edu.absenceMonths = attendance < 0.8 ? edu.absenceMonths + 1 : 0;
      if (edu.unpaidMonths >= 2 || edu.absenceMonths >= 3) {
        const event = emit(
          "dropout",
          "资金或出勤约束中断了课程",
          [person.id],
          {
            schoolId: school.id,
            unpaidMonths: edu.unpaidMonths,
            absenceMonths: edu.absenceMonths,
          },
          { [person.id]: { unpaidMonths: edu.unpaidMonths, attendance } },
        );
        edu.schoolId = null;
        edu.path = "none";
        person.commitments = person.commitments.filter(
          (c) => c.kind !== "course",
        );
        appraise(person, -0.4, 0, 0, 0, 0, world.parameters);
        void event;
      } else if (
        world.month - edu.startedMonth + 1 >= school.durationMonths &&
        edu.credits >= school.durationMonths * 0.8
      ) {
        edu.level = Math.max(edu.level, school.path === "university" ? 2 : 1);
        edu.path = "completed";
        edu.schoolId = null;
        person.development.credentials.push({
          id: `credential:${world.month}:${person.id}`,
          schoolId: school.id,
          level: edu.level,
          month: world.month,
        });
        person.commitments = person.commitments.filter(
          (c) => c.kind !== "course",
        );
        emit(
          "graduation",
          "课程、出勤与费用结算支持了阶段完成",
          [person.id],
          { schoolId: school.id, credits: edu.credits, level: edu.level },
          { [person.id]: { level: edu.level, schoolId: school.id } },
        );
      }
    }
  for (const school of Object.values(world.schools).sort((a, b) =>
    a.id.localeCompare(b.id),
  )) {
    const students = Object.values(world.persons).filter(
      (p) => p.alive && p.education.schoolId === school.id,
    );
    const due = students.reduce(
      (s, p) => s + Math.round((p.monthlyHours.course / 160) * 60000),
      0,
    );
    const paid = recordedTransfer(
      world,
      ledger,
      emit,
      school.accountId,
      "external",
      due,
      "课程教学与工具支出",
      students.map((p) => p.id),
    );
    if (due)
      school.quality = clamp01(0.9 * school.quality + 0.1 * (paid / due));
  }
}
function paymentFeedback(world: World, emit: Emit) {
  const currentArrears = new Set(
    Object.values(world.claims)
      .filter((c) => c.category === "wage" && c.originMonth === world.month)
      .map((c) => c.creditorAccountId),
  );
  for (const person of sortedPeople(world))
    if (person.alive && person.employment.positionId) {
      const position = world.positions[person.employment.positionId],
        paid = !currentArrears.has(person.cashAccountId);
      const event = emit(
        "payment",
        "承诺工资与到账金额核对",
        [person.id],
        {
          firmId: position.firmId,
          grossDue: person.employment.lastGrossWage,
          received: person.employment.lastIncome,
          arrears: person.employment.wageArrears,
        },
        {
          [person.id]: {
            received: person.employment.lastIncome,
            arrears: person.employment.wageArrears,
            paidCurrent: paid,
          },
        },
      );
      if (world.parameters.beliefLearning) {
        const key = `${position.firmId}/payment`;
        person.beliefs[key] = updateBeta(
          person.beliefs[key] ?? newBelief(tickOf(world)),
          paid,
          tickOf(world),
          event.sequence,
          world.parameters.beliefHalfLifeMonths,
        );
      }
      if (!paid) appraise(person, -0.5, -0.6, 1, 0.5, 0.6, world.parameters);
    }
}
export function collectMetrics(world: World): Metrics {
  const alive = sortedPeople(world).filter((p) => p.alive),
    eligible = alive.filter(
      (p) =>
        ageOf(p, world.month) >= 18 &&
        !p.education.schoolId &&
        (p.state.health > 0.2 || p.employment.positionId),
    ),
    employed = eligible.filter((p) => p.employment.positionId);
  const incomes = alive.map((p) => p.employment.lastIncome),
    cashValues = alive.map((p) => cash(world, p.cashAccountId));
  return {
    month: world.month,
    population: Object.keys(world.persons).length,
    alive: alive.length,
    employed: employed.length,
    eligibleWorkers: eligible.length,
    employmentRate: eligible.length ? employed.length / eligible.length : 0,
    meanCash: mean(cashValues),
    medianCash: quantile(cashValues, 0.5),
    incomeP10: quantile(incomes, 0.1),
    incomeP50: quantile(incomes, 0.5),
    incomeP90: quantile(incomes, 0.9),
    meanStress: mean(alive.map((p) => p.state.stress)),
    meanEnergy: mean(alive.map((p) => p.state.energy)),
    meanWellbeing: mean(
      alive.map((p) => mean(Object.values(p.state.wellbeing))),
    ),
    ...world.counters,
    openOpportunities: Object.values(world.issues).filter(
      (i) => !i.resolved && i.noticed,
    ).length,
    openDefects:
      Object.values(world.issues).filter((i) => !i.resolved && i.realDefect)
        .length +
      world.pendingEvents.filter((e) => e.kind === "repair").length +
      Object.values(world.firms).reduce(
        (s, f) => s + f.maintenanceTasks.filter((t) => t.realDefect).length,
        0,
      ),
    consumptionGap: sum(
      Object.values(world.households).map((h) => h.shortfall),
    ),
    activeFirms: Object.values(world.firms).filter((f) => f.status === "active")
      .length,
    totalProfit: sum(Object.values(world.firms).map((f) => f.lastProfit)),
    totalCash: totalCash(world),
    externalNet: world.externalSector.inflow - world.externalSector.outflow,
    accountingError: accountingError(world),
  };
}
export interface StepOptions {
  captureDecisions?: boolean;
  captureEvents?: boolean;
  checkInvariants?: boolean;
}
export function stepWorld(world: World, options: StepOptions = {}): StepResult {
  const events: WorldEvent[] = [],
    ledger: LedgerEntry[] = [],
    captured: Decision[] = [];
  const emit = createEmitter(world, events, options.captureEvents !== false);
  world.month++;
  world.substep = 0;
  for (const firm of Object.values(world.firms))
    if (firm.status === "closed") {
      firm.lastProfit = 0;
      firm.lastRevenue = 0;
      firm.lastOutput = 0;
      firm.wagesDue = 0;
      firm.wagesPaid = 0;
    }
  applyInterventions(world, emit);
  applyMacroInputs(world, ledger, emit);
  demographicUpdate(world, ledger, emit);
  assignCare(world);
  applyAppointments(world, emit);
  refreshOrders(world);
  announceVacancies(world);
  const applications = new Map<string, { hours: number; ids: string[] }>(),
    enrolRequests = new Set<string>(),
    sharedJobs = new Map<string, Set<string>>();
  for (let substep = 0; substep < 4; substep++) {
    world.substep = substep as World["substep"];
    const people = sortedPeople(world).filter(
      (p) => p.alive && ageOf(p, world.month) >= 15,
    );
    for (const [id, issue] of Object.entries(world.issues).sort(([a], [b]) =>
      a.localeCompare(b),
    )) {
      const positionId = world.persons[issue.personId]?.employment.positionId;
      const noLongerEmployedHere =
        !positionId || world.positions[positionId]?.firmId !== issue.firmId;
      if (
        issue.resolved ||
        issue.expiresTick < tickOf(world) ||
        noLongerEmployedHere
      ) {
        if (!issue.resolved && issue.noticed) {
          world.counters.silentReports++;
          world.persons[issue.personId].memory.silentReports++;
          emit(
            "silence",
            noLongerEmployedHere
              ? "任职关系结束，尚未提出的问题转交原机构"
              : "核实期限结束，尚未提出的问题暂缓表达",
            [issue.personId],
            { issueId: id },
            {
              [issue.personId]: {
                expired: true,
                employmentEnded: noLongerEmployedHere,
              },
            },
          );
        }
        if (!issue.resolved && issue.realDefect) {
          const event = emit(
            "undetected-defect",
            "未被及时识别的缺陷形成后续维护",
            [],
            { firmId: issue.firmId, issueId: id },
          );
          world.pendingEvents.push({
            id: `repair:${id}`,
            dueMonth: world.month + 2,
            kind: "repair",
            targetId: issue.firmId,
            causeId: event.id,
            payload: { hours: 8 },
          });
        }
        delete world.issues[id];
      }
    }
    spawnIssues(world, people);
    const observations = new Map<string, Observation>(),
      decisions = new Map<string, Decision>();
    // 所有人从同一子步开始状态观察与决策，之后才统一执行。
    for (const person of people) {
      const o = observe(world, person.id);
      observations.set(person.id, o);
      decisions.set(
        person.id,
        decide(o, person, world.parameters, world.personalityModel),
      );
    }
    // 所有人完成同一起点的观察与计划后，先衰减旧情绪，再注入本子步的事件反馈。
    for (const person of people) decayEmotions(person, world.parameters);
    const execution = [...decisions.values()].sort(
      (a, b) =>
        uniform(
          world.seeds.feedback,
          world.month,
          `execute/${substep}/${a.personId}`,
        ) -
          uniform(
            world.seeds.feedback,
            world.month,
            `execute/${substep}/${b.personId}`,
          ) || a.personId.localeCompare(b.personId),
    );
    for (const decision of execution) {
      const person = world.persons[decision.personId],
        o = observations.get(person.id)!;
      const feedbackStart = events.length;
      const outcome = expression(world, person, decision, o, emit);
      outcome.reward += workAndLearn(
        world,
        person,
        decision,
        o,
        outcome.forcedHours,
        emit,
      );
      const ownHours = decision.selected.hours;
      const event = emit(
        "action",
        "人物在可行集合中完成了一次选择",
        [person.id],
        {
          action: decision.selected.id,
          probability: decision.probability,
          expectedReward: decision.expectedReward,
          actualReward: outcome.reward,
          context: decision.context,
          domain: decision.selected.domain,
        },
        {
          [person.id]: {
            action: decision.selected.id,
            expectedReward: decision.expectedReward,
            actualReward: outcome.reward,
            probability: decision.probability,
            studyHours: ownHours.study,
            practiceHours: ownHours.practice,
            workHours: ownHours.work,
            courseHours: ownHours.course,
            careHours: ownHours.care,
            restHours: ownHours.rest,
            candidates:
              options.captureEvents === false
                ? ""
                : JSON.stringify(
                    decision.candidates.map((c) => ({
                      action: c.plan.id,
                      value: c.value,
                      probability: c.probability,
                    })),
                  ),
          },
        },
        {
          hours: sum(Object.values(ownHours)),
          causes: events.slice(feedbackStart).map((e) => e.id),
        },
      );
      remember(
        person,
        decision,
        event.id,
        event.sequence,
        o.currentFirmId ?? o.contacts[0]?.id ?? "",
        outcome.reward,
        world.parameters,
      );
      if (decision.selected.id === "search") {
        const entry = applications.get(person.id) ?? { hours: 0, ids: [] };
        entry.hours += decision.selected.hours.search;
        entry.ids = [
          ...new Set([...entry.ids, ...o.knownPositions.map((p) => p.id)]),
        ];
        applications.set(person.id, entry);
      }
      if (decision.selected.id === "enrol") enrolRequests.add(person.id);
      if (
        decision.selected.id === "move" &&
        o.canMove &&
        world.households[person.householdId].memberIds.length > 1
      ) {
        const old = world.households[person.householdId],
          id = `household:move:${world.month}:${person.id}`,
          accountId = `account:${id}`;
        const cost = transfer(
          world,
          ledger,
          person.cashAccountId,
          "external",
          decision.selected.estimatedCost,
          "独立居住搬迁成本",
          event.id,
        );
        if (cost === decision.selected.estimatedCost) {
          old.memberIds = old.memberIds.filter((pid) => pid !== person.id);
          world.accounts[accountId] = {
            id: accountId,
            ownerId: id,
            kind: "household",
            balance: 0,
          };
          world.households[id] = {
            ...structuredClone(old),
            id,
            memberIds: [person.id],
            accountId,
            lastConsumption: 0,
            shortfall: 0,
            basicNeed: 0,
            careDemand: 0,
          };
          person.householdId = id;
          emit(
            "household-move",
            "独立居住改变了家庭支持与支出",
            [person.id],
            { from: old.id, to: id, cost },
            { [person.id]: { householdId: id } },
            { money: cost, causes: [event.id] },
          );
        }
      }
      if (options.captureDecisions) captured.push(decision);
    }
    const support = socialInteractions(
      world,
      decisions,
      observations,
      emit,
      sharedJobs,
    );
    for (const decision of decisions.values())
      updateState(
        world.persons[decision.personId],
        decision.selected.hours,
        observations.get(decision.personId)!.cashShortfall,
        support.get(decision.personId) ?? 0,
        world.parameters,
      );
  }
  // 招聘和录取先统一完成，承诺下月生效；同一个人不会同时被两套系统占用。
  admit(world, enrolRequests, emit);
  recruit(world, applications, emit);
  if (world.month % 3 === 0) {
    const promotionApplications = new Map<
      string,
      { hours: number; ids: string[] }
    >();
    for (const person of sortedPeople(world))
      if (person.alive && person.employment.positionId) {
        const current = world.positions[person.employment.positionId];
        const ids = Object.keys(person.knownVacancies).filter((id) => {
          const next = world.positions[id];
          return (
            next && next.grade > current.grade && next.firmId === current.firmId
          );
        });
        // 仅使用本月真实投入过的求职时间。
        if (ids.length && person.monthlyHours.search >= 4)
          promotionApplications.set(person.id, {
            hours: person.monthlyHours.search,
            ids,
          });
      }
    recruit(world, promotionApplications, emit);
  }
  settleEconomy(world, ledger, emit);
  paymentFeedback(world, emit);
  educationCompletion(world, ledger, emit);
  for (const person of sortedPeople(world))
    if (person.alive)
      consolidate(
        person,
        world.month,
        world.parameters,
        world.personalityModel,
      );
  evolveInstitutions(world, emit);
  considerEntrants(world, ledger, emit);
  for (const [id, edge] of Object.entries(world.relations)) {
    if (!world.persons[edge.a]?.alive || !world.persons[edge.b]?.alive) {
      delete world.relations[id];
      continue;
    }
    edge.strength *= pow(2, -1 / 6);
    if (!edge.family && edge.strength < 0.005) delete world.relations[id];
  }
  if (options.checkInvariants) assertWorld(world);
  const metrics = collectMetrics(world);
  if (metrics.accountingError !== 0)
    throw new Error(`社会现金不守恒：${metrics.accountingError} 分`);
  return { month: world.month, events, ledger, metrics, decisions: captured };
}
export function branchWorld(
  checkpoint: WorldCheckpoint,
  intervention: Intervention,
): World {
  if (
    checkpoint.schemaVersion !== 2 ||
    checkpoint.world.ruleVersion !== SOCIAL_VERSION ||
    checkpoint.month !== checkpoint.world.month
  )
    throw new Error("检查点版本或月份不一致。");
  if (
    !Number.isInteger(intervention.fromMonth) ||
    intervention.fromMonth <= checkpoint.month
  )
    throw new Error("干预只能从快照之后的月份生效。");
  if (
    intervention.punitive !== undefined &&
    (!Number.isFinite(intervention.punitive) ||
      intervention.punitive < 0 ||
      intervention.punitive > 1)
  )
    throw new Error("处罚倾向必须在 0—1。");
  const world = structuredClone(checkpoint.world);
  if (intervention.parameters)
    validateParameters({ ...world.parameters, ...intervention.parameters });
  if (intervention.firmIds?.some((id) => !world.firms[id]))
    throw new Error("干预引用了不存在的机构。");
  const firms = Object.values(world.firms).filter(
    (f) => !intervention.firmIds || intervention.firmIds.includes(f.id),
  );
  const changesPolicy = firms.some(
    (f) =>
      (intervention.punitive !== undefined &&
        intervention.punitive !== f.policy.punitive) ||
      (intervention.lockPolicy !== undefined &&
        intervention.lockPolicy !== f.policyLocked),
  );
  const changesParameters = Object.entries(intervention.parameters ?? {}).some(
    ([k, v]) =>
      JSON.stringify(world.parameters[k as keyof typeof world.parameters]) !==
      JSON.stringify(v),
  );
  if (!changesPolicy && !changesParameters) return world;
  world.interventionHistory.push({
    ...structuredClone(intervention),
    createdAtMonth: checkpoint.month,
  });
  return world;
}
