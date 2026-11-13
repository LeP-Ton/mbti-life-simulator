// 浏览器 Worker 与 Node 批量运行共用的公共计算接口。
export { createWorld, checkpoint, assertWorld } from "./population";
export { observe, decide } from "./decision";
export { stepWorld, branchWorld, collectMetrics } from "./engine";
export { runWorld, runBranch, projectLife } from "./run";
export {
  runExperiment,
  runSensitivity,
  evaluatePredictions,
  distributionComparison,
  summarizeEffects,
} from "./research";
export { defaultScenario, parameterBundle } from "./config";
export { sampleExogenousEvents } from "./exogenous";
export { runStructuralAblation } from "./structure";
export type * from "./types";
