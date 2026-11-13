import { defaultScenario } from "./config";
import { stepWorld } from "./engine";
import { checkpoint, createWorld } from "./population";
import { loadCheckpoint, saveCheckpoint, saveWorldRun } from "./persistence";
import { runExperiment, runSensitivity } from "./research";
import { runStructuralAblation, type StructureSpec } from "./structure";
import { runBranch, runWorld, selectCheckpointMonth } from "./run";
import type {
  ExperimentSpec,
  Intervention,
  ScenarioConfig,
  WorldCheckpoint,
  WorldRun,
} from "./types";

export type WorkerRequest =
  | { type: "run"; config: ScenarioConfig }
  | {
      type: "branch";
      parent: WorldRun;
      month: number;
      intervention: Intervention;
    }
  | { type: "experiment"; spec: ExperimentSpec }
  | { type: "structure"; spec: StructureSpec }
  | {
      type: "sensitivity";
      options: {
        seed: string;
        population: number;
        months: number;
        points: number;
      };
    }
  | { type: "cancel" };

let cancelled = false,
  busy = false;
const context = self as unknown as {
  postMessage: (message: unknown) => void;
  onmessage: ((event: MessageEvent<WorkerRequest>) => void) | null;
};
const progress = (completed: number, total: number, label = "计算共享社会") =>
  context.postMessage({ type: "progress", completed, total, label });
context.onmessage = async (event) => {
  const request = event.data;
  if (request.type === "cancel") {
    cancelled = true;
    return;
  }
  if (busy) {
    context.postMessage({ type: "error", message: "请等待当前任务结束。" });
    return;
  }
  busy = true;
  cancelled = false;
  let persistent = true;
  const storageWarning = (error: unknown) => {
    if (persistent)
      context.postMessage({
        type: "warning",
        message: error instanceof Error ? error.message : String(error),
      });
    persistent = false;
  };
  const onCheckpoint = async (state: WorldCheckpoint, id: string) => {
    if (persistent)
      try {
        await saveCheckpoint(state, id);
      } catch (error) {
        storageWarning(error);
      }
  };
  try {
    if (request.type === "run" || request.type === "branch") {
      const hooks = {
        onCheckpoint,
        onProgress: progress,
        shouldCancel: () => cancelled,
        yieldEvery: 1,
        checkInvariants: true,
      };
      let result: WorldRun;
      if (request.type === "run")
        result = await runWorld(request.config, hooks);
      else {
        let state: WorldCheckpoint | null = null;
        const month = selectCheckpointMonth(
          request.parent.checkpointMonths,
          request.month,
        );
        try {
          state = await loadCheckpoint(request.parent.id, month);
        } catch (error) {
          storageWarning(error);
        }
        // 导入 JSON 或隐私模式没有持久化快照时，从 V2 配置确定性重建整个社会。
        if (!state) {
          const world = createWorld(defaultScenario(request.parent.config));
          world.interventionHistory = structuredClone(
            request.parent.finalWorld.interventionHistory,
          );
          while (world.month < request.month) {
            if (cancelled) throw new Error("模拟已取消。");
            stepWorld(world);
            progress(
              world.month,
              request.parent.config.months,
              "重建完整社会检查点",
            );
            await new Promise((resolve) => setTimeout(resolve, 0));
          }
          state = checkpoint(world);
        }
        result = await runBranch(
          request.parent,
          state,
          request.month,
          request.intervention,
          hooks,
        );
      }
      if (persistent)
        try {
          await saveWorldRun(result);
        } catch (error) {
          storageWarning(error);
        }
      context.postMessage({ type: "run-result", run: result, persistent });
    } else if (request.type === "experiment") {
      const report = await runExperiment(request.spec, {
        onProgress: progress,
        shouldCancel: () => cancelled,
        yieldEvery: 1,
      });
      context.postMessage({ type: "experiment-result", report });
    } else if (request.type === "structure") {
      const report = await runStructuralAblation(request.spec, {
        onProgress: progress,
        shouldCancel: () => cancelled,
        yieldEvery: 1,
      });
      context.postMessage({ type: "structure-result", report });
    } else {
      const report = await runSensitivity(request.options, {
        onProgress: progress,
        shouldCancel: () => cancelled,
        yieldEvery: 1,
      });
      context.postMessage({ type: "sensitivity-result", report });
    }
  } catch (error) {
    context.postMessage({
      type: cancelled ? "cancelled" : "error",
      message: error instanceof Error ? error.message : String(error),
    });
  } finally {
    busy = false;
  }
};
