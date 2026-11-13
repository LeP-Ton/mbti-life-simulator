import { DOMAINS, FUNCTIONS } from "../simulation/types";
import { MATRIX } from "./config";
import { bounded, clamp01, mean, sum, updateEmotions } from "./math";
import {
  BIG5,
  NEEDS,
  type Decision,
  type Domain,
  type DomainVector,
  type Experience,
  type Hours,
  type Parameters,
  type Person,
  type PersonalityModel,
} from "./types";

export function learn(
  person: Person,
  hours: Hours,
  domain: Domain,
  courseWeights: DomainVector,
  support: number,
  p: Parameters,
) {
  for (const d of DOMAINS) {
    const knowledge = person.development.knowledge[d],
      practice = person.development.practice[d];
    const study =
      (d === domain ? hours.study : 0) + hours.course * courseWeights[d];
    const applied = d === domain ? hours.practice + 0.5 * hours.work : 0;
    person.development.knowledge[d] = clamp01(
      knowledge +
        ((p.knowledgeRate * support * study) / 160) * (1 - knowledge) -
        p.knowledgeDecay * knowledge * 0.25,
    );
    person.development.practice[d] = clamp01(
      practice +
        ((p.practiceRate * applied) / 160) *
          (0.3 + 0.7 * knowledge) *
          (1 - practice) -
        p.practiceDecay * practice * 0.25,
    );
    if (d === domain)
      person.interests[d] = clamp01(
        person.interests[d] + 0.002 * (hours.practice / 40 - 0.25),
      );
  }
  person.development.examPractice = clamp01(
    person.development.examPractice +
      (0.015 * (hours.course + hours.study)) / 160 -
      0.001 * 0.25 * person.development.examPractice,
  );
  person.memory.totalStudyHours += hours.study + hours.course;
  person.memory.totalPracticeHours += hours.practice;
  person.memory.totalWorkHours += hours.work;
}
export function updateState(
  person: Person,
  hours: Hours,
  shortfall: number,
  support: number,
  p: Parameters,
) {
  const e = person.state.emotions;
  const available = 80 * (0.5 + 0.5 * person.state.health);
  const energyTarget = clamp01(
    0.8 +
      (0.25 * hours.rest) / 40 -
      (0.35 * (hours.work + hours.study + hours.course)) / 80 -
      0.25 * person.state.stress,
  );
  const load = clamp01(
    (hours.work + hours.course + hours.care + hours.search) /
      Math.max(1, available),
  );
  const stressTarget = clamp01(
    0.15 +
      0.35 * load +
      0.35 * shortfall +
      0.25 * mean([e.distress, e.fear, e.anger, e.shame]) -
      (0.3 * hours.rest) / 40 -
      0.15 * support,
  );
  person.state.energy = 0.65 * person.state.energy + 0.35 * energyTarget;
  person.state.stress = 0.75 * person.state.stress + 0.25 * stressTarget;
  person.state.wellbeing.autonomy = clamp01(
    (hours.rest + hours.practice + hours.study + hours.connection) /
      Math.max(1, available),
  );
  person.state.wellbeing.mastery = mean(
    Object.values(person.development.knowledge),
  );
  person.state.wellbeing.belonging = clamp01(
    0.9 * person.state.wellbeing.belonging + 0.1 * support,
  );
}
export function decayEmotions(person: Person, p: Parameters) {
  person.state.emotions = updateEmotions(
    person.state.emotions,
    { desirability: 0, norm: 0, self: 0, other: 0, likelihood: 0, severity: 0 },
    7.5,
    p.emotionHalfLifeDays,
    p.emotionImpulse,
  );
}
export function appraise(
  person: Person,
  desirability: number,
  norm: number,
  other: number,
  likelihood: number,
  severity: number,
  p: Parameters,
) {
  person.state.emotions = updateEmotions(
    person.state.emotions,
    {
      desirability: bounded(desirability, -1, 1),
      norm: bounded(norm, -1, 1),
      self: 1 - other,
      other,
      likelihood: clamp01(likelihood),
      severity: clamp01(severity),
    },
    0,
    p.emotionHalfLifeDays,
    p.emotionImpulse,
  );
}
export function remember(
  person: Person,
  decision: Decision,
  eventId: string,
  sequence: number,
  counterpartId: string,
  actualReward: number,
  p: Parameters,
) {
  const experience: Experience = {
    eventId,
    sequence,
    tick: decision.tick,
    context: decision.context,
    counterpartId,
    action: decision.selected.id,
    reward: actualReward,
    expected: decision.expectedReward,
    probability: decision.probability,
    probabilities: Object.fromEntries(
      decision.candidates.map((c) => [c.plan.id, c.probability]),
    ),
    features: [...decision.selected.features],
  };
  person.memory.recent.push(experience);
  if (person.memory.recent.length > 16) person.memory.recent.shift();
  if (p.habitLearning) person.memory.quarter.push(experience);
  if (p.plasticity) {
    person.memory.annual.push(experience);
    if (person.memory.annual.length > 192) person.memory.annual.shift();
  }
  person.memory.lastAction = decision.selected.id;
  person.memory.lastHours = { ...decision.selected.hours };
}
export function consolidate(
  person: Person,
  month: number,
  p: Parameters,
  model: PersonalityModel,
) {
  if (month % 3 === 0) {
    if (p.habitLearning && person.memory.quarter.length) {
      const groups = new Map<string, Experience[]>();
      for (const e of person.memory.quarter) {
        const list = groups.get(e.context) ?? [];
        list.push(e);
        groups.set(e.context, list);
      }
      const before: number[] = [],
        after: number[] = [],
        evidenceIds: string[] = [];
      for (const [context, events] of groups) {
        const baseline = mean(events.map((e) => e.reward)),
          actions = [
            ...new Set(events.flatMap((e) => Object.keys(e.probabilities))),
          ].sort();
        for (const action of actions) {
          const change = bounded(
            p.habitRate *
              mean(
                events.map(
                  (e) =>
                    (e.reward - baseline) *
                    (Number(e.action === action) -
                      (e.probabilities[
                        action as keyof typeof e.probabilities
                      ] ?? 0)),
                ),
              ),
            -0.2,
            0.2,
          );
          const key = `${context}/${action}`,
            general = `general/${context.endsWith("/issue") ? "issue" : "routine"}/${action}`;
          const old = person.habits[key] ?? 0;
          person.habits[key] = bounded(old + change, -2, 2);
          person.habits[general] = bounded(
            (person.habits[general] ?? 0) + change,
            -2,
            2,
          );
          before.push(old);
          after.push(person.habits[key]);
        }
        evidenceIds.push(...events.map((e) => e.eventId));
      }
      person.memory.revisions.push({
        id: `habit:${month}:${person.id}`,
        month,
        layer: "habit",
        baseVersion: person.profiles.version,
        status: "accepted",
        reason: "季度情境策略学习，未修改基础人格",
        evidenceIds: [...new Set(evidenceIds)],
        before,
        after,
      });
    }
    person.memory.quarter = [];
  }
  if (month % 12 === 0 && p.plasticity && model !== "none") {
    const events = [
      ...new Map(person.memory.annual.map((e) => [e.eventId, e])).values(),
    ];
    const contexts = new Set(events.map((e) => e.context.split("/").at(-1))),
      actors = new Set(events.map((e) => e.counterpartId).filter(Boolean));
    const eligible =
      events.length >= 24 && contexts.size >= 3 && actors.size >= 2;
    const keys = model === "jung8" ? [...FUNCTIONS] : [...BIG5];
    const current: Record<string, number> =
      model === "jung8"
        ? person.profiles.effectiveJung8
        : person.profiles.effectiveBig5;
    const initial: Record<string, number> =
      model === "jung8"
        ? person.profiles.initialJung8
        : person.profiles.initialBig5;
    const feedback = Array.from({ length: 6 }, (_, i) =>
      bounded(
        mean(events.map((e) => (e.reward - e.expected) * e.features[i])),
        -1,
        1,
      ),
    );
    const before = keys.map((k) => current[k]),
      after = keys.map((k) => {
        const scale = model === "jung8" ? 100 : 1;
        const row = MATRIX[k],
          magnitude = sum(row.map(Math.abs));
        const delta =
          0.005 * sum(row.map((v, i) => (v / magnitude) * feedback[i])) -
          (0.1 * (current[k] - initial[k])) / scale;
        return eligible
          ? bounded(
              current[k] + bounded(delta * scale, -0.01 * scale, 0.01 * scale),
              0,
              scale,
            )
          : current[k];
      });
    person.memory.revisions.push({
      id: `trait:${month}:${person.id}`,
      month,
      layer: "trait",
      baseVersion: person.profiles.version,
      status: eligible ? "accepted" : "deferred",
      reason: eligible
        ? "探索性反馈漂移，通过证据数量、情境与幅度检查；不代表现实人格变化已获验证"
        : "独立事件、情境或互动对象不足，保留原版本",
      evidenceIds: events.map((e) => e.eventId),
      counterEvidenceIds: events
        .filter((e) => e.reward < e.expected)
        .map((e) => e.eventId),
      scope: "本人的多情境预测误差；探索性假设，不作为人群推断",
      before,
      after,
    });
    if (eligible) {
      keys.forEach((k, i) => {
        current[k] = after[i];
      });
      person.profiles.version++;
    }
    person.memory.annual = [];
  }
  if (person.memory.revisions.length > 24)
    person.memory.revisions.splice(0, person.memory.revisions.length - 24);
}
