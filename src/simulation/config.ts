import type {
  Domain,
  DomainValues,
  Environment,
  PersonConfig,
  Stage,
} from "./types";
import { generateScores } from "./personality";
import { pick } from "./random";

export const RULE_VERSION = "life-rules/1.0.0";
export const TOTAL_MONTHS = 540;
export const DOMAIN_NAMES: Record<Domain, string> = {
  technology: "技术与工具",
  design: "设计与表达",
  research: "研究与理解",
  service: "教育与服务",
  craft: "工艺与实作",
  business: "运营与协作",
};
export const STAGE_NAMES: Record<Stage, string> = {
  school: "中学时光",
  preparation: "求学与探索",
  entry: "初入社会",
  career: "职业与生活",
  later: "人生下半场",
};
export const DOMAIN_ROLES: Record<Domain, string[]> = {
  technology: ["应用开发者", "工具工程师", "系统维护员"],
  design: ["视觉设计师", "内容创作者", "产品设计师"],
  research: ["研究助理", "数据分析员", "应用研究员"],
  service: ["课程设计师", "社区协调员", "教育工作者"],
  craft: ["工艺技术员", "设备技师", "独立手作者"],
  business: ["项目协调员", "运营专员", "业务策划师"],
};
export const ENVIRONMENTS: Environment[] = [
  {
    id: "balanced",
    name: "晴川日常",
    subtitle: "均衡环境",
    description: "资源与规则相对均衡，有考试，也有人愿意看见作品。",
    learningAccess: 0.65,
    exploration: 0.65,
    standardWeight: 0.58,
    credentialBias: 0.4,
    genderBias: 0.12,
    ageBias: 0.24,
    taskAlignment: 0.72,
    dissentSupport: 0.65,
    support: 0.65,
    opportunity: 0.66,
    metricPressure: 0.45,
  },
  {
    id: "scarce",
    name: "窄巷微光",
    subtitle: "资源紧张",
    description: "训练与机会较少，生活成本更低，稳定收入变得更重要。",
    learningAccess: 0.24,
    exploration: 0.4,
    standardWeight: 0.65,
    credentialBias: 0.62,
    genderBias: 0.3,
    ageBias: 0.45,
    taskAlignment: 0.55,
    dissentSupport: 0.42,
    support: 0.3,
    opportunity: 0.28,
    metricPressure: 0.65,
  },
  {
    id: "standard",
    name: "标准答案",
    subtitle: "标准评价较强",
    description: "资源充足，选拔偏好漂亮分数与标签，对不同意见更谨慎。",
    learningAccess: 0.72,
    exploration: 0.25,
    standardWeight: 0.93,
    credentialBias: 0.9,
    genderBias: 0.6,
    ageBias: 0.7,
    taskAlignment: 0.26,
    dissentSupport: 0.2,
    support: 0.4,
    opportunity: 0.63,
    metricPressure: 0.92,
  },
  {
    id: "explore",
    name: "旷野来信",
    subtitle: "鼓励探索 · 竞争较大",
    description: "作品和实际贡献更容易被看见，机会更多，竞争也更充分。",
    learningAccess: 0.82,
    exploration: 0.92,
    standardWeight: 0.35,
    credentialBias: 0.15,
    genderBias: 0.04,
    ageBias: 0.1,
    taskAlignment: 0.9,
    dissentSupport: 0.9,
    support: 0.84,
    opportunity: 0.9,
    metricPressure: 0.43,
  },
];
export const makeDomainValues = (value: number): DomainValues => ({
  technology: value,
  design: value,
  research: value,
  service: value,
  craft: value,
  business: value,
});
export function defaultConfig(seed = "QINGYU-2026"): PersonConfig {
  return {
    name: "林知夏",
    gender: "女",
    region: "青屿市",
    familyResources: 55,
    expectation: "支持探索",
    seed,
    scores: generateScores(seed, "INFP"),
    environment: { ...ENVIRONMENTS[0] },
  };
}
export function randomConfig(seed: string): PersonConfig {
  return {
    ...defaultConfig(seed),
    name: pick(
      [
        "周予安",
        "陈听禾",
        "许星遥",
        "林知夏",
        "沈见川",
        "苏以宁",
        "江澄",
        "陆时雨",
        "程向晚",
        "顾青",
        "方南星",
        "白亦舟",
      ],
      seed,
      "name",
    ),
    gender: pick(["女", "男", "非二元"] as const, seed, "gender"),
    region: pick(["青屿市", "临溪镇", "远岚县"] as const, seed, "region"),
    familyResources:
      Math.round(15 + (Number.parseInt(seed.slice(-2), 36) % 76)) || 50,
    expectation: pick(
      ["支持探索", "重视学历", "尽早稳定"] as const,
      seed,
      "expectation",
    ),
    scores: generateScores(seed),
  };
}
export function monthLabel(month: number): string {
  return `${15 + Math.floor(month / 12)} 岁${month % 12 ? ` ${month % 12} 个月` : ""}`;
}
export const moneyLabel = (value: number): string =>
  `${value < 0 ? "−" : ""}¥${Math.abs(value) >= 10000 ? `${(Math.abs(value) / 10000).toFixed(1)}万` : Math.round(Math.abs(value)).toLocaleString("zh-CN")}`;
