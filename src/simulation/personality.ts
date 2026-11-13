import {
  FUNCTIONS,
  type CognitiveFunction,
  type Mbti,
  type Scores,
  type TypeInference,
} from "./types";
import { clamp, random } from "./random";

export const GENERATION_VERSION = "functions-generator/1.0";
export const INFERENCE_CONFIG = {
  version: "centered-cosine/1.0",
  weights: [1, 0.7, 0.35, 0.1],
  closeThreshold: 0.065,
  tieThreshold: 1e-9,
};
export const TYPE_STACKS: Record<Mbti, CognitiveFunction[]> = {
  ISTJ: ["Si", "Te", "Fi", "Ne"],
  ISFJ: ["Si", "Fe", "Ti", "Ne"],
  INFJ: ["Ni", "Fe", "Ti", "Se"],
  INTJ: ["Ni", "Te", "Fi", "Se"],
  ISTP: ["Ti", "Se", "Ni", "Fe"],
  ISFP: ["Fi", "Se", "Ni", "Te"],
  INFP: ["Fi", "Ne", "Si", "Te"],
  INTP: ["Ti", "Ne", "Si", "Fe"],
  ESTP: ["Se", "Ti", "Fe", "Ni"],
  ESFP: ["Se", "Fi", "Te", "Ni"],
  ENFP: ["Ne", "Fi", "Te", "Si"],
  ENTP: ["Ne", "Ti", "Fe", "Si"],
  ESTJ: ["Te", "Si", "Ne", "Fi"],
  ESFJ: ["Fe", "Si", "Ne", "Ti"],
  ENFJ: ["Fe", "Ni", "Se", "Ti"],
  ENTJ: ["Te", "Ni", "Se", "Fi"],
};
export const TYPES = Object.keys(TYPE_STACKS) as Mbti[];
export const FUNCTION_INFO: Record<
  CognitiveFunction,
  { name: string; brief: string }
> = {
  Ni: { name: "内倾直觉", brief: "整合线索，形成解释与方向" },
  Ne: { name: "外倾直觉", brief: "联系概念，寻找其他可能" },
  Si: { name: "内倾感觉", brief: "对照既有体验与熟悉模式" },
  Se: { name: "外倾感觉", brief: "观察现场，接触当下信息" },
  Ti: { name: "内倾思维", brief: "检查概念与推理的一致性" },
  Te: { name: "外倾思维", brief: "依据外部标准组织行动" },
  Fi: { name: "内倾情感", brief: "关注个人价值与内在边界" },
  Fe: { name: "外倾情感", brief: "关注关系与共同情境" },
};
export function inferMbtiFromFunctions(
  scores: Scores,
  config = INFERENCE_CONFIG,
): TypeInference {
  const result: TypeInference = {
    type: null,
    alternatives: [],
    distinction: 0,
    close: false,
    tied: false,
    ranking: [],
    algorithmVersion: config.version,
  };
  if (
    FUNCTIONS.some(
      (key) =>
        !Number.isFinite(scores?.[key]) || scores[key] < 0 || scores[key] > 100,
    )
  )
    return result;
  result.ranking = [...FUNCTIONS].sort(
    (a, b) =>
      scores[b] - scores[a] || FUNCTIONS.indexOf(a) - FUNCTIONS.indexOf(b),
  );
  const mean = FUNCTIONS.reduce((sum, key) => sum + scores[key], 0) / 8;
  const vector = FUNCTIONS.map((key) => scores[key] - mean);
  const magnitude = Math.hypot(...vector);
  if (magnitude < 1e-10) return result;
  const ranked = TYPES.map((type) => {
    const template = FUNCTIONS.map((key) => {
      const position = TYPE_STACKS[type].indexOf(key);
      return position < 0 ? 0 : config.weights[position];
    });
    const average = template.reduce((sum, value) => sum + value, 0) / 8;
    const centered = template.map((value) => value - average);
    return {
      type,
      similarity:
        vector.reduce((sum, value, i) => sum + value * centered[i], 0) /
        (magnitude * Math.hypot(...centered)),
    };
  }).sort(
    (a, b) =>
      b.similarity - a.similarity ||
      TYPES.indexOf(a.type) - TYPES.indexOf(b.type),
  );
  const gap = ranked[0].similarity - ranked[1].similarity;
  return {
    ...result,
    type: ranked[0].type,
    alternatives: ranked.slice(0, 3),
    distinction: gap,
    close: gap < config.closeThreshold,
    tied: gap < config.tieThreshold,
  };
}
export function generateScores(seed: string, target?: Mbti): Scores {
  const type =
    target ??
    TYPES[Math.floor(random(seed, 0, "personality-type") * TYPES.length)];
  // 先采样向量再验证标签，不以手动覆盖标签的方式伪装生成成功。
  for (let attempt = 0; attempt < 100; attempt++) {
    const baseline = 23 + random(seed, 0, `baseline-${attempt}`) * 20;
    const amplitude = 40 + random(seed, 0, `amplitude-${attempt}`) * 20;
    const scores = Object.fromEntries(
      FUNCTIONS.map((key) => {
        const position = TYPE_STACKS[type].indexOf(key);
        const center = position < 0 ? 0 : INFERENCE_CONFIG.weights[position];
        return [
          key,
          Math.round(
            clamp(
              baseline +
                amplitude * center +
                (random(seed, 0, `${key}-${attempt}`) - 0.5) * 20,
            ),
          ),
        ];
      }),
    ) as Scores;
    if (inferMbtiFromFunctions(scores).type === type) return scores;
  }
  return Object.fromEntries(
    FUNCTIONS.map((key) => {
      const position = TYPE_STACKS[type].indexOf(key);
      return [
        key,
        25 + (position < 0 ? 0 : INFERENCE_CONFIG.weights[position] * 60),
      ];
    }),
  ) as Scores;
}
