import { DOMAINS } from "../simulation/types";
import { FUNCTIONS } from "../simulation/types";
import type {
  Domain,
  DomainVector,
  ParameterBundle,
  Parameters,
  PersonalityModel,
  ScenarioConfig,
  Vector6,
} from "./types";
export const SOCIAL_VERSION = "social-rules/2.1.1";
export const PARAMETER_ID = "synthetic-v2/2";
export const REGIONS = ["青屿市", "临溪镇", "远岚县"];
export const MODEL_NAMES: Record<PersonalityModel, string> = {
  jung8: "八维假设",
  big5: "大五假设",
  none: "无人格效应",
};
export const ACTION_NAMES = {
  deliver: "履行职责",
  study: "集中学习",
  practice: "项目实践",
  search: "寻找岗位",
  connect: "维护与合作",
  recover: "恢复状态",
  public: "公开提出",
  private: "私下沟通",
  verify: "补充核实",
  silent: "暂缓表达",
  enrol: "申请学习",
  move: "独立居住",
};
export const NEED_NAMES = {
  material: "生活保障",
  security: "安全预期",
  mastery: "知识掌握",
  autonomy: "自主时间",
  belonging: "互惠关系",
  fairness: "程序公平",
};
export const DEFAULT_PARAMETERS: Parameters = {
  personalityStrength: 0.25,
  temperature: 0.15,
  discount: 0.95,
  riskAversion: 0.1,
  beliefHalfLifeMonths: 24,
  beliefLearning: true,
  habitLearning: true,
  institutionLearning: true,
  plasticity: false,
  habitRate: 0.1,
  institutionRate: 0.02,
  emotionHalfLifeDays: 7.5,
  emotionImpulse: 0.6,
  knowledgeRate: 0.03,
  practiceRate: 0.02,
  knowledgeDecay: 0.001,
  practiceDecay: 0.0005,
  publicInformation: 0.65,
  totalDemand: 600,
  unitRevenue: 800000,
  materialsRate: 0.2,
  operatingCost: 500000,
  assessmentAccuracy: 0.85,
  issueRate: 0.12,
  birthAnnualRisk: 0.06,
  healthAnnualRisk: 0.04,
  migrationAnnualRate: 0,
  wageTax: 0.1,
  profitTax: 0.15,
  housingCost: 120000,
  mortalityAnnual: [0.0002, 0.0006, 0.004, 0.02, 0.08, 0.2],
};
export const JUNGIANS = FUNCTIONS;
export const MATRIX: Record<string, Vector6> = {
  Ni: [0.4, 0.2, 0.6, -0.2, 0, 0],
  Ne: [0.5, 0.8, -0.2, 0.2, 0, 0],
  Si: [0.1, -0.2, 0.8, 0, 0.1, 0],
  Se: [0.1, 0.3, -0.1, 0.8, 0.1, 0],
  Ti: [0.8, 0.1, 0.2, 0, 0, 0.1],
  Te: [0.3, -0.1, 0.5, 0.6, 0, 0],
  Fi: [0.1, 0.1, 0, 0, 0.1, 0.9],
  Fe: [0, 0, -0.1, 0.1, 0.9, 0.3],
  O: [0.5, 0.8, 0, 0, 0, 0.1],
  C: [0.2, -0.2, 0.8, 0.1, 0, 0.1],
  E: [0, 0.2, 0, 0.4, 0.7, 0],
  A: [0, 0, 0.1, -0.1, 0.7, 0.3],
  N: [-0.1, -0.1, 0.2, -0.2, 0, 0.1],
};
export const domainValues = (value: number): DomainVector =>
  Object.fromEntries(DOMAINS.map((d) => [d, value])) as DomainVector;
export const domainWeights = (main: Domain): DomainVector =>
  Object.fromEntries(
    DOMAINS.map((d) => [d, d === main ? 0.75 : 0.05]),
  ) as DomainVector;
export const WAGES = [350000, 600000, 900000];
export const PRODUCTIVITY = [1, 1.6, 2.5];
export function defaultScenario(
  overrides: Partial<ScenarioConfig> = {},
): ScenarioConfig {
  return {
    seed: "SOCIAL-2026",
    population: 1000,
    model: "jung8",
    parameters: structuredClone(DEFAULT_PARAMETERS),
    trackedIds: ["person-00000"],
    focalName: "林知夏",
    months: 540,
    ...overrides,
  };
}
export function parameterBundle(
  parameters: Parameters = DEFAULT_PARAMETERS,
): ParameterBundle {
  const units: Partial<Record<keyof Parameters, string>> = {
    beliefHalfLifeMonths: "月",
    emotionHalfLifeDays: "天",
    unitRevenue: "分/标准产出",
    operatingCost: "分/月",
    housingCost: "分/月",
    totalDemand: "标准全职产出/月",
  };
  return {
    id: PARAMETER_ID,
    calibrated: false,
    parameters: structuredClone(parameters),
    evidence: [
      ...Object.entries(parameters).map(([key, value]) => ({
        key,
        value,
        unit:
          units[key as keyof Parameters] ??
          (typeof value === "boolean" ? "开关" : "无量纲"),
        range:
          typeof value === "boolean"
            ? "true/false"
            : [
                  "temperature",
                  "beliefHalfLifeMonths",
                  "emotionHalfLifeDays",
                ].includes(key)
              ? "> 0"
              : key === "mortalityAnnual"
                ? "六个 0—1 年风险"
                : "有限非负数；概率项上限为 1，金额为安全整数分",
        source:
          "REQ-20261113102022 用户确认的 V2 机制规格；合成假设，未使用真实调查数据估计",
        population: "合成人口，不代表现实地区",
        status: "hypothesis" as const,
        version: PARAMETER_ID,
      })),
      ...Object.entries(MATRIX).map(([key, value]) => ({
        key: `preferenceMatrix.${key}`,
        value,
        unit: "行动特征权重，计算时按行 L1 归一化",
        range: "−1—1",
        source: "V2 规格中的探索性人格偏好假设",
        population: "合成模型，不代表量表测得的真实行为效应",
        status: "hypothesis" as const,
        version: PARAMETER_ID,
      })),
      ...[
        ["wages", WAGES, "分/月"],
        ["gradeOutput", PRODUCTIVITY, "标准产出系数"],
        ["schoolDuration", [48, 36, 24], "月"],
        ["schoolAnnualFees", [600000, 400000, 200000], "分/年"],
        ["schoolAnnualSeats", 2, "名/校，按初始人口缩放"],
        ["firmCapacity", 32, "岗位/企业，按初始人口缩放"],
        ["householdCashMedian", 3000000, "分"],
        ["householdCashLogSD", 1, "对数标准差"],
        ["governmentOpeningBudget", 200000000, "分，按初始人口缩放"],
        ["householdContributionRate", 0.6, "税后工资比例"],
        ["personalityPlasticityAnnualCap", 0.01, "归一化人格单位/年"],
        ["relationHalfLife", 6, "月"],
        ["taskDifficultyByGrade", [0.2, 0.4, 0.6], "任务质量阈值"],
        ["taskAppraisalDesirability", 0.25, "自我评价强度"],
        [
          "initialHouseholdCounts",
          [100, 100, 150, 50],
          "默认千人时的一、二、三、五人户",
        ],
      ].map(([key, value, unit]) => ({
        key: `rules.${key}`,
        value: value as number | number[],
        unit: String(unit),
        range: "固定合成规则常数；变更须提升规则版本",
        source: "用户确认的 synthetic-v2 初始世界与规则",
        population: "合成人口；数量按初始人口缩放，非现实人口估计",
        status: "hypothesis" as const,
        version: PARAMETER_ID,
      })),
    ],
  };
}
export function validateParameters(p: Parameters) {
  if (!p || typeof p !== "object") throw new Error("缺少参数对象。");
  for (const [key, expected] of Object.entries(DEFAULT_PARAMETERS)) {
    const value = p[key as keyof Parameters];
    if (
      Array.isArray(expected)
        ? !Array.isArray(value)
        : typeof value !== typeof expected
    )
      throw new Error(`参数 ${key} 缺失或类型错误。`);
  }
  for (const key of Object.keys(p))
    if (!(key in DEFAULT_PARAMETERS)) throw new Error(`未知参数：${key}`);
  for (const [key, value] of Object.entries(p)) {
    if (typeof value === "boolean") continue;
    for (const n of Array.isArray(value) ? value : [value])
      if (!Number.isFinite(n) || n < 0)
        throw new Error(`参数 ${key} 必须为有限非负数。`);
  }
  for (const key of [
    "discount",
    "publicInformation",
    "materialsRate",
    "assessmentAccuracy",
    "issueRate",
    "birthAnnualRisk",
    "healthAnnualRisk",
    "migrationAnnualRate",
    "wageTax",
    "profitTax",
    "emotionImpulse",
  ] as const)
    if (p[key] > 1) throw new Error(`参数 ${key} 不得大于 1。`);
  if (
    p.temperature <= 0 ||
    p.beliefHalfLifeMonths <= 0 ||
    p.emotionHalfLifeDays <= 0
  )
    throw new Error("温度和半衰期必须大于零。");
  if (p.mortalityAnnual.length !== 6 || p.mortalityAnnual.some((v) => v > 1))
    throw new Error("死亡风险需要六个 0—1 年概率。");
  for (const key of ["unitRevenue", "operatingCost", "housingCost"] as const)
    if (!Number.isSafeInteger(p[key]))
      throw new Error(`参数 ${key} 必须使用整数分。`);
}
