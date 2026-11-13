import { useState } from "react";
import { Download, FlaskConical, Play, ScanLine } from "lucide-react";
import { MODEL_NAMES } from "../social/config";
import { downloadFile, exportExperiment } from "../social/export";
import type { SensitivityReport } from "../social/research";
import type { ExperimentReport, ExperimentSpec } from "../social/types";
import { percent } from "./SocialViews";
import type { StructureReport, StructureSpec } from "../social/structure";

const METRICS: Record<string, string> = {
  publicRate: "公开表达比例",
  privateRate: "私下沟通比例",
  silenceRate: "暂缓表达比例",
  validReportShare: "已提出报告中正确比例",
  invalidReportShare: "已提出报告中错误比例",
  fixRate: "缺陷修复比例",
  beliefError: "风险信念均方误差",
  employmentRate: "就业比例",
  incomeP50: "月收入中位数 / 分",
  profit: "企业当月利润 / 分",
  reworkHours: "累计返工 / h",
  separations: "累计离职人次",
  hires: "累计录用人次",
};
export function SocialExperiments({
  busy,
  report,
  sensitivity,
  onRun,
  onSensitivity,
  initialPopulation,
  initialSeed,
  structure,
  onStructure,
}: {
  busy: boolean;
  report: ExperimentReport | null;
  sensitivity: SensitivityReport | null;
  onRun: (spec: ExperimentSpec) => void;
  onSensitivity: (options: {
    seed: string;
    population: number;
    months: number;
    points: number;
  }) => void;
  initialPopulation: number;
  initialSeed: string;
  structure: StructureReport | null;
  onStructure: (spec: StructureSpec) => void;
}) {
  const [population, setPopulation] = useState(initialPopulation),
    [seed, setSeed] = useState(initialSeed),
    [seeds, setSeeds] = useState(30),
    [warmup, setWarmup] = useState(120),
    [followup, setFollowup] = useState(60),
    [error, setError] = useState("");
  const [horizon, setHorizon] = useState<"year1" | "endpoint">("endpoint");
  const run = (smoke = false) => {
    if (
      !Number.isInteger(seeds) ||
      seeds < 1 ||
      !Number.isInteger(warmup) ||
      warmup < 0 ||
      !Number.isInteger(followup) ||
      followup < 1
    ) {
      setError("重复数和月份必须为有效整数。");
      return;
    }
    setError("");
    onRun({
      seed,
      population: smoke ? 80 : population,
      seeds: smoke ? 2 : seeds,
      warmupMonths: smoke ? 12 : warmup,
      followupMonths: smoke ? 12 : followup,
    });
  };
  return (
    <div className="sl-stack">
      <section className="sl-card">
        <div className="sl-section-title">
          <div>
            <span className="sl-kicker">EXPERIMENT / 12 CONDITIONS</span>
            <h2>组织回应，怎样改变表达？</h2>
          </div>
          <FlaskConical size={24} />
        </div>
        <p className="sl-muted">
          相同资源和外生条件下，比较处罚倾向如何通过信念学习影响表达、修正、流动与经营。独立重复单位是整个世界。
        </p>
        <div className="sl-factor-grid">
          <div>
            <b>03</b>
            <span>八维 / 大五 / 无人格</span>
          </div>
          <span>×</span>
          <div>
            <b>02</b>
            <span>处罚倾向 .2 / .8</span>
          </div>
          <span>×</span>
          <div>
            <b>02</b>
            <span>信念学习 开 / 关</span>
          </div>
        </div>
        <div className="sl-form-grid">
          <label>
            实验种子
            <input value={seed} onChange={(e) => setSeed(e.target.value)} />
          </label>
          <label>
            每个世界初始人口
            <input
              type="number"
              min="3"
              max="10000"
              value={population}
              onChange={(e) => setPopulation(Number(e.target.value))}
            />
          </label>
          <label>
            独立世界重复数
            <input
              type="number"
              min="1"
              max="1000"
              value={seeds}
              onChange={(e) => setSeeds(Number(e.target.value))}
            />
          </label>
          <label>
            预热月数
            <input
              type="number"
              min="0"
              value={warmup}
              onChange={(e) => setWarmup(Number(e.target.value))}
            />
          </label>
          <label>
            干预后月数
            <input
              type="number"
              min="1"
              value={followup}
              onChange={(e) => setFollowup(Number(e.target.value))}
            />
          </label>
        </div>
        <p className="sl-footnote">
          处理期锁定处罚倾向，关闭习惯与机构学习。完整默认实验共 360
          个条件世界；大规模运行建议使用 Node 并行命令，浏览器也可本地执行。
        </p>
        <div className="sl-actions">
          <button className="sl-primary" disabled={busy} onClick={() => run()}>
            <Play size={16} />
            运行十二条件实验
          </button>
          <button
            className="sl-secondary"
            disabled={busy}
            onClick={() => run(true)}
          >
            小规模流程验证
          </button>
        </div>
        {error && (
          <p className="sl-error" role="alert">
            {error}
          </p>
        )}
        <details className="sl-details">
          <summary>批量命令与敏感性分析</summary>
          <pre>
            npm run experiment -- experiment --workers 4{"\n"}npm run experiment
            -- sensitivity --points 64 --months 60{"\n"}npm run experiment --
            run --model none --months 540
          </pre>
          <p className="sl-muted">
            敏感性分析覆盖人格强度、选择温度、信念遗忘、风险偏好、习惯学习率及主管判断准确率。用绝对相关筛查前两项，再做五乘五网格；不等同于完整方差分解。
          </p>
          <button
            className="sl-secondary"
            disabled={busy}
            onClick={() =>
              onSensitivity({ seed, population, months: followup, points: 64 })
            }
          >
            <ScanLine size={16} />
            运行 64 + 25 组敏感性分析
          </button>
          <button
            className="sl-secondary"
            disabled={busy}
            onClick={() =>
              onStructure({
                seed,
                population,
                seeds,
                warmupMonths: warmup,
                months: followup,
              })
            }
          >
            四种学习结构对照
          </button>
        </details>
      </section>
      {report && (
        <section className="sl-card">
          <div className="sl-section-title">
            <div>
              <span className="sl-kicker">PAIRED WORLD RESULTS</span>
              <h2>政策效应与不确定性</h2>
            </div>
            <button
              className="sl-secondary"
              onClick={() => exportExperiment(report)}
            >
              <Download size={16} />
              JSON
            </button>
          </div>
          <p className="sl-callout">
            {report.label} · {report.ruleVersion ?? "版本未注明"} · 计划{" "}
            {report.spec.seeds} 个独立重复 · 预热 {report.spec.warmupMonths}{" "}
            月，跟踪 {report.spec.followupMonths} 月
          </p>
          <p className="sl-muted">
            下表是高处罚减低处罚的世界种子配对差；区间仅反映蒙特卡洛误差。比例以
            0—1 表示，现金使用分。
          </p>
          <label>
            政策效应时点
            <select
              value={horizon}
              onChange={(e) =>
                setHorizon(e.target.value as "year1" | "endpoint")
              }
            >
              <option value="year1">
                处理第 {Math.min(12, report.spec.followupMonths)} 月
              </option>
              <option value="endpoint">
                处理终点 · 第 {report.spec.followupMonths} 月
              </option>
            </select>
          </label>
          <div className="sl-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>人格假设</th>
                  <th>信念学习</th>
                  <th>指标</th>
                  <th>平均差</th>
                  <th>95% 区间</th>
                  <th>独立 n</th>
                </tr>
              </thead>
              <tbody>
                {report.effects
                  .filter((e) => (e.horizon ?? "endpoint") === horizon)
                  .map((e) => (
                    <tr key={`${e.model}/${e.learning}/${e.metric}`}>
                      <td>{MODEL_NAMES[e.model]}</td>
                      <td>{e.learning ? "开" : "关"}</td>
                      <td>{METRICS[e.metric] ?? e.metric}</td>
                      <td>{e.mean.toFixed(4)}</td>
                      <td>
                        {!e.interval95
                          ? "重复不足，无法估计"
                          : `${e.interval95[0].toFixed(4)} ～ ${e.interval95[1].toFixed(4)}`}
                      </td>
                      <td>{e.n}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
          <div className="sl-research-notes">
            {report.uncertainty.map((note) => (
              <p key={note}>{note}</p>
            ))}
          </div>
          <details className="sl-details">
            <summary>一年与终点结果 · 各条件逐种子明细</summary>
            <div className="sl-table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>重复 / 模型</th>
                    <th>ρ / 学习</th>
                    <th>一年公开比例</th>
                    <th>终点公开比例</th>
                    <th>终点真实缺陷 / 修复</th>
                  </tr>
                </thead>
                <tbody>
                  {report.cells.map((c) => (
                    <tr
                      key={`${c.replicate}/${c.model}/${c.punitive}/${c.learning}`}
                    >
                      <td>
                        {c.replicate + 1} / {MODEL_NAMES[c.model]}
                      </td>
                      <td>
                        {c.punitive} / {c.learning ? "开" : "关"}
                      </td>
                      <td>
                        {percent(
                          c.year1.publicReports /
                            Math.max(1, c.year1.observedOpportunities),
                        )}
                      </td>
                      <td>
                        {percent(
                          c.year5.publicReports /
                            Math.max(1, c.year5.observedOpportunities),
                        )}
                      </td>
                      <td>
                        {c.year5.defects} / {c.year5.fixedDefects}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </section>
      )}
      {sensitivity && (
        <section className="sl-card">
          <div className="sl-section-title">
            <h2>参数敏感性筛查</h2>
            <button
              className="sl-secondary"
              onClick={() =>
                downloadFile(
                  "敏感性分析.json",
                  JSON.stringify(sensitivity, null, 2),
                )
              }
            >
              <Download size={16} />
              JSON
            </button>
          </div>
          <p className="sl-muted">{sensitivity.method}</p>
          <div className="sl-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>参数</th>
                  <th>公开表达比例的相关</th>
                </tr>
              </thead>
              <tbody>
                {sensitivity.ranking.map((r) => (
                  <tr key={r.parameter}>
                    <td>{r.parameter}</td>
                    <td>{r.correlation.toFixed(4)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="sl-footnote">
            已执行 {sensitivity.points.length} 个拉丁超立方点与{" "}
            {sensitivity.grid.length} 个交互网格点。全部未标定。
          </p>
        </section>
      )}
      {structure && (
        <section className="sl-card">
          <div className="sl-section-title">
            <h2>学习结构对照</h2>
            <button
              className="sl-secondary"
              onClick={() =>
                downloadFile(
                  "学习结构对照.json",
                  JSON.stringify(structure, null, 2),
                )
              }
            >
              <Download size={16} />
              JSON
            </button>
          </div>
          <p className="sl-muted">{structure.scope}</p>
          <div className="sl-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>独立重复</th>
                  <th>结构</th>
                  <th>公开报告</th>
                  <th>就业比例</th>
                  <th>归一化平均人格漂移</th>
                </tr>
              </thead>
              <tbody>
                {structure.cells.map((c) => (
                  <tr key={`${c.replicate}/${c.condition}`}>
                    <td>{c.replicate + 1}</td>
                    <td>{c.condition}</td>
                    <td>{c.metrics.publicReports}</td>
                    <td>{percent(c.metrics.employmentRate)}</td>
                    <td>{c.meanTraitDrift.toFixed(5)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
