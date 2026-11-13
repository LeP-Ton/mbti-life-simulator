import { DOMAINS } from "../simulation/types";
import { educationPreference, observe } from "./decision";
import { cash } from "./ledger";
import {
  bounded,
  clamp01,
  dot,
  mean,
  normal,
  sigmoid,
  softmax,
  uniform,
} from "./math";
import { ageOf, primaryDomain, sortedPeople } from "./population";
import type { Id, LedgerEntry, Person, World, WorldEvent } from "./types";
import { scheduleMaintenance } from "./maintenance";
import { exp } from "./numeric";

export type Emit = (
  kind: string,
  title: string,
  actors: string[],
  truth: WorldEvent["truth"],
  observations?: WorldEvent["observations"],
  costs?: { hours?: number; money?: number; causes?: string[] },
) => WorldEvent;

// 申请人提议的延迟接受；接收方统一排序，不让遍历顺序决定有限资源归属。
export function deferredAcceptance(
  preferences: Record<Id, Id[]>,
  capacities: Record<Id, number>,
  score: (receiver: Id, applicant: Id) => number,
): Record<Id, Id> {
  const applicants = Object.keys(preferences).sort(),
    next = Object.fromEntries(applicants.map((id) => [id, 0]));
  const held: Record<string, string[]> = {},
    assignments: Record<string, string> = {};
  let queue = [...applicants];
  while (queue.length) {
    const proposals: Record<string, string[]> = {};
    for (const applicant of queue.sort()) {
      const receiver = preferences[applicant][next[applicant]++];
      if (receiver) (proposals[receiver] ??= []).push(applicant);
    }
    queue = [];
    for (const receiver of Object.keys(proposals).sort()) {
      const candidates = [
        ...(held[receiver] ?? []),
        ...proposals[receiver],
      ].sort(
        (a, b) => score(receiver, b) - score(receiver, a) || a.localeCompare(b),
      );
      const capacity = Math.max(0, Math.floor(capacities[receiver] ?? 0));
      held[receiver] = candidates.slice(0, capacity);
      for (const rejected of candidates.slice(capacity))
        if (next[rejected] < preferences[rejected].length) queue.push(rejected);
    }
  }
  for (const receiver of Object.keys(held).sort())
    for (const applicant of held[receiver]) assignments[applicant] = receiver;
  return assignments;
}
export function refreshOrders(world: World) {
  const groups = new Map<string, (typeof world.firms)[string][]>();
  for (const firm of Object.values(world.firms).sort((a, b) =>
    a.id.localeCompare(b.id),
  ))
    if (firm.status === "active") {
      const key = `${firm.regionId}/${firm.domain}`,
        group = groups.get(key) ?? [];
      group.push(firm);
      groups.set(key, group);
    }
  const scale = Number(world.scenarioId.split(":").at(-1)) / 1000;
  for (const [key, firms] of groups) {
    const shock = exp(
      0.08 * normal(world.seeds.shocks, world.month, `orders/${key}`),
    );
    const demand =
      ((world.parameters.totalDemand * scale) / 18) *
      shock *
      world.externalSector.demandIndex *
      (world.externalSector.segmentMultipliers[key] ?? 1);
    const shares = softmax(firms.map((f) => 2 * f.reputation - f.priceIndex));
    firms.forEach((firm, i) => {
      firm.orders = demand * shares[i];
      const expectedProductivity = 0.6 + 0.4 * firm.reputation;
      const budgetLimit = Math.floor(
        cash(world, firm.accountId) / (3 * 350000),
      );
      const required = Math.min(
        firm.capacity,
        Math.ceil(firm.orders / expectedProductivity),
        Math.max(0, budgetLimit),
      );
      const counts = [
        Math.ceil((required * 22) / 32),
        Math.floor((required * 8) / 32),
        Math.floor((required * 2) / 32),
      ];
      let total = counts.reduce((a, b) => a + b, 0);
      for (let g = 0; total < required; g = (g + 1) % 3) {
        counts[g]++;
        total++;
      }
      const positions = firm.positionIds.map((id) => world.positions[id]);
      for (let g = 0; g < 3; g++)
        positions
          .filter((p) => p.grade === g)
          .sort((a, b) => a.id.localeCompare(b.id))
          .forEach((p, j) => {
            p.enabled = !!p.holderId || j < counts[g];
          });
    });
  }
}
export function announceVacancies(world: World) {
  const reserved = new Set(
    world.pendingEvents.filter((e) => e.kind === "job").map((e) => e.targetId),
  );
  const vacancies = Object.values(world.positions)
    .filter(
      (p) =>
        p.enabled &&
        !p.holderId &&
        !reserved.has(p.id) &&
        world.firms[p.firmId].status === "active",
    )
    .sort((a, b) => a.id.localeCompare(b.id));
  const pools = new Map<string, typeof vacancies>();
  for (const p of vacancies) {
    const key = `${world.firms[p.firmId].regionId}/${p.domain}`,
      list = pools.get(key) ?? [];
    list.push(p);
    pools.set(key, list);
  }
  for (const person of sortedPeople(world)) {
    if (!person.alive || ageOf(person, world.month) < 18) continue;
    for (const [id, expiry] of Object.entries(person.knownVacancies))
      if (
        expiry < world.month ||
        !world.positions[id] ||
        world.positions[id].holderId
      )
        delete person.knownVacancies[id];
    if (
      uniform(world.seeds.shocks, world.month, `public-info/${person.id}`) >=
      world.parameters.publicInformation
    )
      continue;
    const preferred =
      pools.get(`${person.regionId}/${primaryDomain(person)}`) ?? [];
    const pool = preferred.length ? preferred : vacancies;
    for (let j = 0; j < Math.min(6, pool.length); j++) {
      const position =
        pool[
          Math.floor(
            uniform(
              world.seeds.shocks,
              world.month,
              `public-info/${person.id}/${j}`,
            ) * pool.length,
          )
        ];
      person.knownVacancies[position.id] = world.month + 2;
    }
  }
}
export function applyAppointments(world: World, emit: Emit) {
  const due = world.pendingEvents
    .filter((e) => e.dueMonth <= world.month)
    .sort((a, b) => a.id.localeCompare(b.id));
  world.pendingEvents = world.pendingEvents.filter(
    (e) => e.dueMonth > world.month,
  );
  for (const e of due) {
    const person = e.personId ? world.persons[e.personId] : null;
    if (e.kind === "job" && person?.alive) {
      const position = e.targetId ? world.positions[e.targetId] : null;
      if (
        !position ||
        position.holderId ||
        world.firms[position.firmId].status !== "active"
      ) {
        emit("offer-cancelled", "岗位承诺未能生效", [person.id], {
          reason: "岗位已关闭或不再可用",
        });
        continue;
      }
      const previous = person.employment.positionId
        ? world.positions[person.employment.positionId]
        : null;
      if (previous) {
        previous.holderId = null;
        world.firms[previous.firmId].turnover++;
        world.counters.separations++;
      }
      position.holderId = person.id;
      person.employment.positionId = position.id;
      person.employment.startedMonth = world.month;
      person.employment.searchMonths = 0;
      person.employment.leaveReason = null;
      person.commitments = person.commitments.filter((c) => c.kind !== "work");
      person.commitments.push({
        id: `contract:${position.id}`,
        kind: "work",
        hours: 40,
        targetId: position.id,
      });
      world.counters.hires++;
      emit(
        previous && previous.firmId === position.firmId
          ? "promotion"
          : "employment",
        "一份岗位从这个月开始",
        [person.id],
        {
          firmId: position.firmId,
          positionId: position.id,
          grade: position.grade,
          wage: position.wage,
        },
        {
          [person.id]: {
            firmId: position.firmId,
            wage: position.wage,
            grade: position.grade,
          },
        },
        { causes: [e.causeId] },
      );
    } else if (e.kind === "school" && person?.alive) {
      const school = e.targetId ? world.schools[e.targetId] : null;
      if (!school) continue;
      const previousSchoolId = person.education.schoolId,
        previousCredits = person.education.credits;
      if (person.employment.positionId) {
        const old = world.positions[person.employment.positionId];
        old.holderId = null;
        world.firms[old.firmId].turnover++;
        world.counters.separations++;
        person.employment.positionId = null;
      }
      person.education = {
        path: school.path,
        schoolId: school.id,
        domain: DOMAINS.reduce(
          (a, d) => (school.courseWeights[d] > school.courseWeights[a] ? d : a),
          DOMAINS[0],
        ),
        level: person.education.level,
        startedMonth: world.month,
        credits: 0,
        unpaidMonths: 0,
        absenceMonths: 0,
        attendance: 1,
      };
      person.commitments = person.commitments.filter(
        (c) => c.kind !== "work" && c.kind !== "course",
      );
      person.commitments.push({
        id: `course:${school.id}:${world.month}`,
        kind: "course",
        hours: 40,
        targetId: school.id,
      });
      emit(
        "education",
        previousSchoolId
          ? "转入新课程，既往知识保留而课程学分重新累计"
          : "开始一段新的课程",
        [person.id],
        {
          schoolId: school.id,
          fee: school.annualFee,
          duration: school.durationMonths,
          previousSchoolId: previousSchoolId ?? "",
          discardedCredits: previousSchoolId ? previousCredits : 0,
        },
        {
          [person.id]: {
            schoolId: school.id,
            fee: school.annualFee,
            previousSchoolId: previousSchoolId ?? "",
            discardedCredits: previousSchoolId ? previousCredits : 0,
          },
        },
        { causes: [e.causeId] },
      );
    } else if (e.kind === "repair") {
      const firm = e.targetId ? world.firms[e.targetId] : null;
      if (firm?.status === "active") {
        const cost = Number(e.payload.hours ?? 8);
        scheduleMaintenance(firm, {
          id: e.id,
          remaining: cost,
          total: cost,
          realDefect: true,
          causeId: e.causeId,
        });
        emit(
          "maintenance",
          "先前推迟的维护进入待办队列",
          [],
          { firmId: firm.id, hours: cost },
          {},
          { causes: [e.causeId] },
        );
      }
    }
  }
}
export function recruit(
  world: World,
  applications: Map<string, { hours: number; ids: string[] }>,
  emit: Emit,
) {
  const preferences: Record<string, string[]> = {},
    capacities: Record<string, number> = {};
  const reserved = new Set(
    world.pendingEvents.filter((e) => e.kind === "job").map((e) => e.targetId),
  );
  const scores = new Map<string, number>();
  for (const [id, application] of [...applications].sort(([a], [b]) =>
    a.localeCompare(b),
  )) {
    const person = world.persons[id];
    if (
      !person?.alive ||
      ageOf(person, world.month) < 18 ||
      person.education.schoolId ||
      world.pendingEvents.some(
        (e) => e.personId === id && (e.kind === "job" || e.kind === "school"),
      )
    )
      continue;
    const current = person.employment.positionId
      ? world.positions[person.employment.positionId]
      : null;
    const choices = application.ids
      .map((k) => world.positions[k])
      .filter(
        (p) =>
          p &&
          p.enabled &&
          !p.holderId &&
          !reserved.has(p.id) &&
          world.firms[p.firmId].status === "active",
      )
      .filter(
        (p) => !current || p.wage > current.wage || person.state.stress > 0.45,
      )
      .sort(
        (a, b) =>
          (b.wage - currentWage(person)) * 0.000001 +
            person.interests[b.domain] -
            ((a.wage - currentWage(person)) * 0.000001 +
              person.interests[a.domain]) || a.id.localeCompare(b.id),
      );
    const max = Math.min(3, Math.floor(application.hours / 4));
    preferences[id] = choices
      .slice(0, max)
      .filter((p) => {
        const firm = world.firms[p.firmId],
          capability = DOMAINS.reduce(
            (s, d) =>
              s +
              p.requirements[d] *
                (0.4 * person.development.knowledge[d] +
                  0.6 * person.development.practice[d]),
            0,
          );
        const sample = clamp01(
          capability * (0.6 + 0.4 * person.state.energy) +
            0.04 *
              normal(world.seeds.shocks, world.month, `hiring/${p.id}/${id}`),
        );
        const score =
          0.6 * sample +
          firm.policy.credentialWeight * (person.education.level / 2) +
          0.15 * clamp01(person.employment.contributions / 30) -
          (person.gender === "女" ? firm.policy.genderBias : 0) -
          (ageOf(person, world.month) >= 35 ? firm.policy.ageBias : 0);
        scores.set(
          `${p.id}/${id}`,
          score +
            uniform(
              world.seeds.feedback,
              world.month,
              `hiring-tie/${p.id}/${id}`,
            ) *
              1e-7,
        );
        capacities[p.id] = 1;
        return sample >= [0.08, 0.25, 0.45][p.grade];
      })
      .map((p) => p.id);
  }
  const matches = deferredAcceptance(
    preferences,
    capacities,
    (receiver, applicant) =>
      scores.get(`${receiver}/${applicant}`) ?? -Infinity,
  );
  for (const [personId, positionId] of Object.entries(matches).sort(
    ([a], [b]) => a.localeCompare(b),
  )) {
    const event = emit(
      "offer",
      "通过一次实际岗位考察",
      [personId],
      { positionId, score: scores.get(`${positionId}/${personId}`) ?? 0 },
      { [personId]: { positionId, wage: world.positions[positionId].wage } },
      { hours: 4 },
    );
    world.pendingEvents.push({
      id: `appointment:${world.month}:${personId}`,
      dueMonth: world.month + 1,
      kind: "job",
      personId,
      targetId: positionId,
      causeId: event.id,
      payload: {},
    });
  }
}
const currentWage = (person: Person) => person.employment.lastGrossWage;
export function admit(world: World, requested: Set<string>, emit: Emit) {
  const preferences: Record<string, string[]> = {},
    capacities: Record<string, number> = {},
    scores: Record<string, number> = {};
  for (const school of Object.values(world.schools))
    capacities[school.id] = Math.max(0, school.annualSeats - school.usedSeats);
  for (const id of [...requested].sort()) {
    const person = world.persons[id];
    if (
      !person?.alive ||
      ageOf(person, world.month) < 18 ||
      world.pendingEvents.some(
        (e) => e.personId === id && (e.kind === "school" || e.kind === "job"),
      )
    )
      continue;
    const score = clamp01(
      0.5 * mean(Object.values(person.development.knowledge)) +
        0.35 * person.development.examPractice +
        0.15 * person.state.energy -
        0.1 * person.state.stress +
        0.05 * normal(world.seeds.shocks, world.month, `exam/${id}`),
    );
    scores[id] = score;
    const o = observe(world, id);
    preferences[id] = o.schools
      .filter(
        (s) =>
          score >= world.schools[s.id].cutoff &&
          s.fee <= o.ownCash + o.householdCash,
      )
      .sort(
        (a, b) =>
          educationPreference(o, person, b.id) -
            educationPreference(o, person, a.id) || a.id.localeCompare(b.id),
      )
      .slice(0, 3)
      .map((s) => s.id);
  }
  const matches = deferredAcceptance(
    preferences,
    capacities,
    (receiver, applicant) =>
      scores[applicant] +
      uniform(
        world.seeds.feedback,
        world.month,
        `admission-tie/${receiver}/${applicant}`,
      ) *
        1e-7,
  );
  const ranked = Object.keys(scores).sort(
    (a, b) => scores[b] - scores[a] || a.localeCompare(b),
  );
  for (const [personId, schoolId] of Object.entries(matches).sort(([a], [b]) =>
    a.localeCompare(b),
  )) {
    world.schools[schoolId].usedSeats++;
    const event = emit(
      "admission",
      "在有限名额中获得学习机会",
      [personId],
      {
        schoolId,
        score: scores[personId],
        rank: ranked.indexOf(personId) + 1,
        applicants: ranked.length,
      },
      {
        [personId]: {
          schoolId,
          score: scores[personId],
          rank: ranked.indexOf(personId) + 1,
        },
      },
    );
    world.pendingEvents.push({
      id: `enrol:${world.month}:${personId}`,
      dueMonth: world.month + 1,
      kind: "school",
      personId,
      targetId: schoolId,
      causeId: event.id,
      payload: {},
    });
  }
}
