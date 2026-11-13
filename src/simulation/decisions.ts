import { DOMAIN_NAMES } from "./config";
import { clamp, random } from "./random";
import {
  DOMAINS,
  type Allocation,
  type Character,
  type Choice,
  type Domain,
  type Environment,
  type LifeState,
} from "./types";

export function choose(
  choices: Choice[],
  seed: string,
  month: number,
  key: string,
): Choice {
  return [...choices].sort((a, b) => {
    const utility = (choice: Choice) =>
      choice.utility + random(seed, month, `${key}:${choice.id}`) * 0.055;
    return utility(b) - utility(a) || a.id.localeCompare(b.id);
  })[0];
}
export function leadingDomain(state: LifeState): Domain {
  return [...DOMAINS].sort(
    (a, b) =>
      state.dynamic.interests[b] - state.dynamic.interests[a] ||
      DOMAINS.indexOf(a) - DOMAINS.indexOf(b),
  )[0];
}
export function monthlyDecision(
  person: Character,
  state: LifeState,
  env: Environment,
): { choice: Choice; allocation: Allocation; domain: Domain } {
  const scores = person.scores;
  const { energy, stress, money, voice } = state.dynamic;
  const education = state.stage === "school" || state.stage === "preparation";
  const domain = leadingDomain(state);
  const options: Choice[] = [
    {
      id: "consolidate",
      label: education ? "巩固课程与规范练习" : "先做好手头的交付",
      utility:
        0.34 +
        (education ? env.standardWeight * 0.34 : 0.2) +
        (scores.Si + scores.Te) / 700 +
        (person.expectation === "重视学历" && education ? 0.15 : 0),
      reason: education
        ? "考试临近，熟悉题型能降低不确定性。"
        : "现有职责和稳定收入仍然重要。",
      cost: "自主作品与新方向的时间减少。",
    },
    {
      id: "explore",
      label: education ? "用一个小项目探索兴趣" : "为下一步积累一项实践",
      utility:
        0.24 +
        env.exploration * 0.22 +
        (scores.Ne + scores.Ni + scores.Ti) / 650 +
        state.dynamic.interests[domain] / 450 +
        (state.job && state.job.mismatch > 0.5 ? 0.1 : 0),
      reason: `对${DOMAIN_NAMES[domain]}仍有兴趣，过去的接触使尝试更具体。`,
      cost: "规范练习或可计入考核的投入减少。",
    },
    {
      id: "connect",
      label: "与同伴合作，交换经验",
      utility:
        0.29 +
        (scores.Fe + scores.Se) / 650 +
        env.support * 0.23 +
        (voice > 65 ? 0.07 : -0.03),
      reason: "合作能补足一个人拿不到的信息与支持。",
      cost: "协调需要时间，也有沟通摩擦。",
    },
    {
      id: "recover",
      label: "放慢一点，恢复状态",
      utility:
        0.2 +
        clamp((55 - energy) / 50, 0, 1) +
        stress / 260 +
        (scores.Fi + scores.Si) / 1300,
      reason: "疲惫已经影响学习或工作，休息有实际价值。",
      cost: "短期进度与可见产出变少。",
    },
  ];
  if (money < 1500 && !education) options[0].utility += 0.27;
  const choice = choose(options, person.seed, state.month, "monthly-action");
  let allocation: Allocation;
  if (education) {
    allocation =
      choice.id === "consolidate"
        ? { study: 92, practice: 30, work: 0, connection: 12, rest: 26 }
        : choice.id === "explore"
          ? { study: 48, practice: 66, work: 0, connection: 14, rest: 32 }
          : choice.id === "connect"
            ? { study: 55, practice: 44, work: 0, connection: 30, rest: 31 }
            : { study: 32, practice: 20, work: 0, connection: 22, rest: 86 };
    if (person.familyResources < 30 && state.month >= 12) {
      allocation.study -= 10;
      allocation.practice -= 8;
      allocation.rest -= 6;
      allocation.work = 24;
    }
  } else {
    allocation =
      choice.id === "consolidate"
        ? { study: 14, practice: 20, work: 96, connection: 12, rest: 18 }
        : choice.id === "explore"
          ? { study: 22, practice: 37, work: 74, connection: 9, rest: 18 }
          : choice.id === "connect"
            ? { study: 16, practice: 18, work: 82, connection: 27, rest: 17 }
            : { study: 10, practice: 10, work: 64, connection: 14, rest: 62 };
    if (!state.job) {
      allocation.study += 20;
      allocation.practice += allocation.work - 40;
      allocation.work = 20;
    }
  }
  return { choice, allocation, domain };
}

export interface TaskEvidence {
  knowledge: number;
  practice: number;
  energy: number;
  stress: number;
  support: number;
  hours: number;
  disturbance: number;
}
// 只接收证据，不接收姓名、性别、年龄、学校标签或八维，防止身份直接渗入原始质量。
export function evaluateTask(evidence: TaskEvidence): number {
  return clamp(
    8 +
      evidence.knowledge * 0.38 +
      evidence.practice * 0.37 +
      evidence.energy * 0.13 -
      evidence.stress * 0.06 +
      evidence.support * 8 +
      Math.min(evidence.hours, 100) * 0.055 +
      (evidence.disturbance - 0.5) * 12,
  );
}
export function evaluateExam(
  knowledge: number,
  training: number,
  energy: number,
  stress: number,
  disturbance: number,
): number {
  return clamp(
    12 +
      knowledge * 0.44 +
      training * 0.4 +
      energy * 0.1 -
      stress * 0.07 +
      (disturbance - 0.5) * 12,
  );
}
export function screeningReason(
  person: Character,
  state: LifeState,
  env: Environment,
  disturbance: number,
): string | null {
  // 偏见只作用于机会门槛，原始作品与任务质量在筛选前已独立保存。
  if (
    env.credentialBias > 0.65 &&
    state.education.prestige < 65 &&
    disturbance < env.credentialBias * 0.64
  )
    return "学校标签未通过预筛选，作品尚未被查看";
  if (
    person.gender === "女" &&
    disturbance > 0.55 &&
    disturbance < 0.55 + env.genderBias * 0.38
  )
    return "招聘方使用了性别偏见门槛，未查看相关作品";
  if (15 + state.month / 12 >= 35 && disturbance < env.ageBias * 0.26)
    return "年龄门槛先行，既有贡献未进入评价";
  return null;
}
