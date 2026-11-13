import { mkdir, readFile, writeFile, readdir, stat } from "node:fs/promises";
import { createWriteStream } from "node:fs";
import { once } from "node:events";
import { cpus } from "node:os";
import path from "node:path";
import { Worker } from "node:worker_threads";
import { build } from "esbuild";
import { createHash } from "node:crypto";
import {
  defaultScenario,
  parameterBundle,
  SOCIAL_VERSION,
} from "../src/social/config";
import {
  evaluatePredictions,
  runExperiment,
  runSensitivity,
  summarizeEffects,
} from "../src/social/research";
import { runWorld } from "../src/social/run";
import { runStructuralAblation } from "../src/social/structure";
import { thirdPartyNotices } from "./licenses";
import type {
  ExperimentCell,
  ExperimentReport,
  ExperimentSpec,
  Parameters,
  PersonalityModel,
  StepResult,
} from "../src/social/types";

const args = process.argv.slice(2),
  command = args[0] ?? "help";
const option = (key: string, fallback: string) => {
  const i = args.indexOf(`--${key}`);
  return i >= 0 ? (args[i + 1] ?? fallback) : fallback;
};
const flag = (key: string) => args.includes(`--${key}`);
const number = (key: string, fallback: number) => {
  const n = Number(option(key, String(fallback)));
  if (!Number.isFinite(n) || n < 0 || !Number.isInteger(n))
    throw new Error(`--${key} 必须为非负整数。`);
  return n;
};
const seed = option("seed", "SOCIAL-2026"),
  smoke = flag("smoke");
const population = number("population", smoke ? 80 : 1000);
const out = path.resolve(
  option(
    "out",
    `outputs/social-${command}-${new Date().toISOString().replace(/[:.]/g, "-")}`,
  ),
);
const parameters = async (): Promise<Partial<Parameters>> => {
  const file = option("parameters", "");
  return file ? JSON.parse(await readFile(file, "utf8")) : {};
};
async function parallelExperiment(
  spec: ExperimentSpec,
  workers: number,
  onCell: (cell: ExperimentCell) => void,
  kernelPath: string,
  initialCells: ExperimentCell[] = [],
): Promise<ExperimentReport> {
  const kernelSha256 = createHash("sha256")
    .update(await readFile(kernelPath))
    .digest("hex");
  const cells: ExperimentCell[] = [...initialCells],
    completed = new Set(cells.map((c) => c.replicate));
  const pending = Array.from({ length: spec.seeds }, (_, i) => i).filter(
    (i) => !completed.has(i),
  );
  let next = 0,
    finished = completed.size;
  for (const cell of initialCells) onCell(cell);
  for (const replicate of completed) {
    const group = initialCells.filter((c) => c.replicate === replicate);
    await writeFile(
      path.join(out, `replicate-${String(replicate).padStart(4, "0")}.json`),
      JSON.stringify({
        format: "social-experiment/2",
        ruleVersion: SOCIAL_VERSION,
        kernelSha256,
        calibrated: false,
        label: "续接的完整独立重复 · 未标定",
        spec: { ...spec, seeds: 1, replicateStart: replicate },
        parentSpec: spec,
        parameterBundle: parameterBundle({
          ...defaultScenario().parameters,
          ...spec.parameters,
        }),
        cells: group,
        effects: summarizeEffects(group),
        uncertainty: ["单个独立重复不能估计蒙特卡洛区间。"],
        resumedFrom: option("resume", ""),
      }),
    );
  }
  if (finished)
    console.log(`从完整报告恢复 ${finished}/${spec.seeds} 个独立重复`);
  await Promise.all(
    Array.from({ length: Math.min(workers, pending.length) }, async () => {
      while (next < pending.length) {
        const replicate = pending[next++];
        await new Promise<void>((resolve, reject) => {
          const worker = new Worker(
            new URL("./experiment-worker.mjs", import.meta.url),
            { workerData: { spec, replicate, kernelPath } },
          );
          let done = false;
          worker.on("message", async (message) => {
            if (message.type === "cell") {
              cells.push(message.cell);
              onCell(message.cell);
            }
            if (message.type === "done") {
              done = true;
              try {
                await writeFile(
                  path.join(
                    out,
                    `replicate-${String(replicate).padStart(4, "0")}.json`,
                  ),
                  JSON.stringify({
                    ...message.report,
                    parentSpec: spec,
                    kernelSha256,
                    kernelPath: path.basename(kernelPath),
                  }),
                );
              } catch (error) {
                reject(error);
                return;
              }
              finished++;
              console.log(`独立世界重复 ${finished}/${spec.seeds} 完成`);
              resolve();
            }
            if (message.type === "error") {
              worker.terminate();
              reject(new Error(message.message));
            }
          });
          worker.on("error", reject);
          worker.on("exit", (code) => {
            if (!done) reject(new Error(`实验工作线程提前退出：${code}`));
          });
        });
      }
    }),
  );
  cells.sort(
    (a, b) =>
      a.replicate - b.replicate ||
      a.model.localeCompare(b.model) ||
      a.punitive - b.punitive ||
      Number(a.learning) - Number(b.learning),
  );
  return {
    format: "social-experiment/2",
    ruleVersion: SOCIAL_VERSION,
    kernelSha256,
    calibrated: false,
    label: "合成机制实验 · 未标定",
    spec,
    parameterBundle: parameterBundle({
      ...defaultScenario().parameters,
      ...spec.parameters,
    }),
    cells,
    effects: summarizeEffects(cells),
    uncertainty: [
      "区间仅为世界种子的配对蒙特卡洛误差，未包含真实参数估计误差。",
      "八维、大五为独立合成模型，跨模型只比较政策效应稳健性。",
      spec.seeds < 30
        ? "当前属于少于三十个重复的流程验证。"
        : "每个条件包含三十个或以上独立世界重复。",
    ],
  };
}
async function resumedCells(
  spec: ExperimentSpec,
  file: string,
  kernelSha256: string,
): Promise<ExperimentCell[]> {
  if (!file) return [];
  const input = path.resolve(file),
    info = await stat(input),
    files = info.isDirectory()
      ? (await readdir(input))
          .filter((name) => /^replicate-\d+\.json$/.test(name))
          .sort()
          .map((name) => path.join(input, name))
      : [input];
  const invariant = (s: ExperimentSpec) =>
    JSON.stringify({
      seed: s.seed,
      population: s.population,
      warmup: s.warmupMonths,
      followup: s.followupMonths,
      models: s.models ?? ["jung8", "big5", "none"],
      parameters: Object.entries({
        ...defaultScenario().parameters,
        ...s.parameters,
      }).sort(([a], [b]) => a.localeCompare(b)),
    });
  const cells: ExperimentCell[] = [];
  for (const name of files) {
    const report = JSON.parse(await readFile(name, "utf8")) as ExperimentReport;
    if (
      report.format !== "social-experiment/2" ||
      report.ruleVersion !== SOCIAL_VERSION ||
      report.kernelSha256 !== kernelSha256 ||
      report.calibrated !== false ||
      invariant(report.spec) !== invariant(spec)
    )
      throw new Error(
        "续跑报告的规则、冻结内核、种子、人口、时期、模型或参数与当前实验不一致，不能混合。请使用原冻结内核，或新建实验。",
      );
    cells.push(...report.cells);
  }
  const keys = new Set<string>();
  for (const c of cells) {
    const key = `${c.replicate}/${c.model}/${c.punitive}/${c.learning}`;
    if (
      keys.has(key) ||
      !Number.isInteger(c.replicate) ||
      c.replicate < 0 ||
      c.seed !== `${spec.seed}/replicate/${c.replicate}` ||
      ![0.2, 0.8].includes(c.punitive) ||
      !["jung8", "big5", "none"].includes(c.model) ||
      typeof c.learning !== "boolean" ||
      c.year5.month !== spec.warmupMonths + spec.followupMonths ||
      c.year5.accountingError !== 0 ||
      Object.values(c.year5).some((v) => !Number.isFinite(v))
    )
      throw new Error("续跑报告有重复、缺损或不守恒的条件记录。");
    keys.add(key);
  }
  const counts = new Map<number, number>();
  for (const c of cells)
    counts.set(c.replicate, (counts.get(c.replicate) ?? 0) + 1);
  const expected = (spec.models ?? ["jung8", "big5", "none"]).length * 4;
  return cells.filter(
    (c) => c.replicate < spec.seeds && counts.get(c.replicate) === expected,
  );
}
async function main() {
  if (command === "help") {
    console.log(
      "社会模拟 V2（全部合成参数均未标定）\nrun：生成社会、完整事件流和年度检查点\nexperiment：十二条件配对实验（默认 30 次，120 月预热＋60 月观察）\nsensitivity：64 点拉丁超立方＋25 点交互网格\nvalidate：评估外部提供的留出预测 JSON\n通用参数：--seed --population --out --parameters；--smoke 使用小规模流程验证\n示例：npm run experiment -- experiment --smoke --workers 2",
    );
    return;
  }
  await mkdir(out, { recursive: true });
  await writeFile(
    path.join(out, "THIRD_PARTY_NOTICES.txt"),
    await thirdPartyNotices(),
  );
  const kernelPath = path.join(out, "kernel.mjs");
  await build({
    entryPoints: [path.resolve("src/social/index.ts")],
    outfile: kernelPath,
    bundle: true,
    platform: "node",
    format: "esm",
    target: "es2022",
    sourcemap: "external",
    sourcesContent: true,
  });
  const kernelSha256 = createHash("sha256")
    .update(await readFile(kernelPath))
    .digest("hex");
  await writeFile(
    path.join(out, "manifest.json"),
    JSON.stringify(
      {
        format: "social-artifacts/2",
        status: "running",
        calibrated: false,
        command,
        seed,
        population,
        kernelSha256,
      },
      null,
      2,
    ),
  );
  const started = performance.now(),
    overrides = await parameters();
  const metrics = createWriteStream(path.join(out, "metrics.ndjson")),
    eventStream =
      command === "run" || flag("events")
        ? createWriteStream(path.join(out, "events.ndjson"))
        : null;
  const ledgerStream =
    command === "run" || flag("events")
      ? createWriteStream(path.join(out, "ledger.ndjson"))
      : null;
  const line = async (
    stream: ReturnType<typeof createWriteStream>,
    value: unknown,
  ) => {
    if (!stream.write(JSON.stringify(value) + "\n"))
      await once(stream, "drain");
  };
  const onStep = async (result: StepResult, label = "run") => {
    await line(metrics, { label, ...result.metrics });
    if (eventStream)
      for (const event of result.events)
        await line(eventStream, { label, ...event });
    if (ledgerStream)
      for (const row of result.ledger)
        await line(ledgerStream, { label, ...row });
  };
  try {
    if (command === "run") {
      const model = option("model", "jung8") as PersonalityModel;
      const config = defaultScenario({
        seed,
        population,
        model,
        months: number("months", smoke ? 12 : 540),
        parameters: { ...defaultScenario().parameters, ...overrides },
      });
      await writeFile(
        path.join(out, "config.json"),
        JSON.stringify(config, null, 2),
      );
      const run = await runWorld(config, {
        onStep,
        onCheckpoint: async (state) => {
          await writeFile(
            path.join(out, `checkpoint-${state.month}.json`),
            JSON.stringify(state),
          );
        },
        onProgress: (month, total) => {
          if (month % 12 === 0 || month === total)
            console.log(`社会月份 ${month}/${total}`);
        },
      });
      await writeFile(path.join(out, "run.json"), JSON.stringify(run));
    } else if (command === "experiment") {
      const spec: ExperimentSpec = {
        seed,
        population,
        seeds: number("seeds", smoke ? 2 : 30),
        warmupMonths: number("warmup", smoke ? 12 : 120),
        followupMonths: number("months", smoke ? 12 : 60),
        parameters: overrides,
      };
      if (spec.seeds < 1) throw new Error("实验至少需要一个独立世界重复。");
      const resume = option("resume", "");
      if (resume && eventStream)
        throw new Error(
          "事件流导出需要完整重跑；续跑只恢复已完整保存的指标条件。",
        );
      const existing = await resumedCells(spec, resume, kernelSha256);
      const workers = Math.max(
        1,
        Math.min(
          number("workers", Math.max(1, Math.min(4, cpus().length - 1))),
          spec.seeds,
        ),
      );
      const report = eventStream
        ? await runExperiment(spec, {
            onStep,
            onProgress: (n, total, label) =>
              console.log(`${n}/${total} ${label}`),
          })
        : await parallelExperiment(
            spec,
            workers,
            (cell) => {
              metrics.write(
                JSON.stringify({
                  model: cell.model,
                  replicate: cell.replicate,
                  punitive: cell.punitive,
                  learning: cell.learning,
                  year1: cell.year1,
                  endpoint: cell.year5,
                }) + "\n",
              );
            },
            kernelPath,
            existing,
          );
      report.kernelSha256 = kernelSha256;
      await writeFile(
        path.join(out, "report.json"),
        JSON.stringify(report, null, 2),
      );
      await writeFile(
        path.join(out, "effects.csv"),
        "horizon,model,learning,metric,mean,standardError,lower95,upper95,n\n" +
          report.effects
            .map((e) =>
              [
                e.horizon,
                e.model,
                e.learning,
                e.metric,
                e.mean,
                e.standardError,
                ...(e.interval95 ?? ["", ""]),
                e.n,
              ].join(","),
            )
            .join("\n"),
      );
    } else if (command === "sensitivity") {
      const report = await runSensitivity(
        {
          seed,
          population,
          months: number("months", smoke ? 6 : 60),
          points: number("points", smoke ? 4 : 64),
          parameters: overrides,
        },
        { onProgress: (n, total) => console.log(`敏感性分析 ${n}/${total}`) },
      );
      await writeFile(
        path.join(out, "sensitivity.json"),
        JSON.stringify(report, null, 2),
      );
    } else if (command === "structure") {
      const report = await runStructuralAblation(
        {
          seed,
          population,
          seeds: number("seeds", smoke ? 2 : 30),
          warmupMonths: number("warmup", smoke ? 2 : 120),
          months: number("months", smoke ? 6 : 60),
          model: option("model", "jung8") as PersonalityModel,
          parameters: overrides,
        },
        {
          onStep,
          onProgress: (n, total) => console.log(`结构对照 ${n}/${total}`),
        },
      );
      await writeFile(
        path.join(out, "structure.json"),
        JSON.stringify(report, null, 2),
      );
    } else if (command === "validate") {
      const file = option("input", "");
      if (!file) throw new Error("validate 需要 --input 指向预测记录 JSON。");
      const records = JSON.parse(await readFile(file, "utf8"));
      const after = option("future-after", "");
      const report = evaluatePredictions(records, {
        seed: option("split-seed", "split-2"),
        futureAfterMonth: after ? Number(after) : undefined,
      });
      await writeFile(
        path.join(out, "validation.json"),
        JSON.stringify(report, null, 2),
      );
    } else throw new Error(`未知命令：${command}`);
    await writeFile(
      path.join(out, "manifest.json"),
      JSON.stringify(
        {
          format: "social-artifacts/2",
          status: "complete",
          kernelSha256,
          calibrated: false,
          command,
          seed,
          population,
          parameters: parameterBundle({
            ...defaultScenario().parameters,
            ...overrides,
          }),
          resumedFrom: option("resume", "") || null,
          fullEventStream: !!eventStream,
          elapsedSeconds: (performance.now() - started) / 1000,
          createdAt: new Date().toISOString(),
        },
        null,
        2,
      ),
    );
    console.log(`结果已写入：${out}；参数未标定。`);
  } finally {
    for (const stream of [metrics, eventStream, ledgerStream])
      if (stream) {
        stream.end();
        await once(stream, "finish");
      }
  }
}
main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
