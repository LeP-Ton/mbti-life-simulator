import { useEffect, useRef, useState } from "react";
import {
  Activity,
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  ChevronRight,
  Download,
  FlaskConical,
  FolderOpen,
  GitBranch,
  Globe2,
  Layers3,
  LoaderCircle,
  Pause,
  Play,
  Plus,
  Save,
  Settings2,
  Upload,
  Wallet,
  X,
} from "lucide-react";
import SocialWorker from "./social/worker?worker&inline";
import { defaultScenario, MODEL_NAMES } from "./social/config";
import { downloadFile, exportWorld, exportWorldHtml } from "./social/export";
import {
  deleteWorldRun,
  listWorldRuns,
  loadWorldRun,
  saveWorldRun,
  validateArchive,
  type RunSummary,
} from "./social/persistence";
import { projectLife } from "./social/run";
import type { SensitivityReport } from "./social/research";
import type { StructureReport } from "./social/structure";
import { validateParameters } from "./social/config";
import type {
  ExperimentReport,
  ScenarioConfig,
  WorldRun,
} from "./social/types";
import type { WorkerRequest } from "./social/worker";
import { loadLives, type SavedLife } from "./lib/storage";
import { Timeline } from "./components/Timeline";
import { Archive } from "./components/Archive";
import { SocialConfig } from "./components/SocialConfig";
import { SocialExperiments } from "./components/SocialExperiments";
import {
  MetricStrip,
  money,
  ParameterSources,
  PersonOverview,
  SocialAccounts,
  SocialArchive,
  SocialComparison,
  SocialTimeline,
} from "./components/SocialViews";
import "./social.css";

const TABS = [
  { id: "life", label: "人生观察", en: "LIFE OBSERVATORY", icon: BookOpen },
  {
    id: "archive",
    label: "发展档案",
    en: "PERSON & EXPERIENCE",
    icon: Layers3,
  },
  { id: "compare", label: "平行社会", en: "COUNTERFACTUALS", icon: GitBranch },
  { id: "accounts", label: "社会账本", en: "RESOURCES & FLOWS", icon: Wallet },
  {
    id: "experiments",
    label: "实验工作台",
    en: "MECHANISM LAB",
    icon: FlaskConical,
  },
  { id: "parameters", label: "参数与来源", en: "ASSUMPTIONS", icon: Settings2 },
  {
    id: "library",
    label: "本地档案",
    en: "LOCAL COLLECTION",
    icon: FolderOpen,
  },
];
type Tab = (typeof TABS)[number]["id"];

export default function SocialLab() {
  const [structure, setStructure] = useState<StructureReport | null>(null);
  const [tab, setTab] = useState<Tab>("life"),
    [run, setRun] = useState<WorldRun | null>(null),
    [parent, setParent] = useState<WorldRun | null>(null),
    [cursor, setCursor] = useState(0),
    [personId, setPersonId] = useState("person-00000"),
    [playing, setPlaying] = useState(false);
  const [setup, setSetup] = useState(true),
    [initial, setInitial] = useState(defaultScenario),
    [busy, setBusy] = useState(false),
    [progress, setProgress] = useState({
      completed: 0,
      total: 1,
      label: "准备模拟",
    }),
    [message, setMessage] = useState(""),
    [error, setError] = useState("");
  const [saved, setSaved] = useState<RunSummary[]>([]),
    [legacy, setLegacy] = useState<SavedLife[]>([]),
    [legacySelected, setLegacySelected] = useState<SavedLife | null>(null),
    [legacyCursor, setLegacyCursor] = useState(0),
    [report, setReport] = useState<ExperimentReport | null>(null),
    [sensitivity, setSensitivity] = useState<SensitivityReport | null>(null);
  const worker = useRef<Worker | null>(null),
    input = useRef<HTMLInputElement | null>(null),
    branchParent = useRef<WorldRun | null>(null);
  const refresh = () =>
    listWorldRuns()
      .then(setSaved)
      .catch((e) => setMessage(e.message));
  useEffect(() => {
    const engine = new SocialWorker();
    worker.current = engine;
    engine.onmessage = (event) => {
      const data = event.data;
      if (data.type === "progress") {
        setProgress(data);
        return;
      }
      if (data.type === "warning") {
        setMessage(data.message);
        return;
      }
      setBusy(false);
      if (data.type === "run-result") {
        const result = data.run as WorldRun;
        setRun(result);
        setParent(branchParent.current);
        setPersonId(result.config.trackedIds[0]);
        setCursor(result.parent?.month ?? 0);
        setInitial(result.config);
        setSetup(false);
        setTab(result.parent ? "compare" : "life");
        setMessage(
          data.persistent
            ? "社会计算完成，完整世界检查点与观察轨迹已存入本地。"
            : "社会计算完成；当前结果未持久化，请导出 JSON。无法保存的历史检查点可由 V2 配置确定性重建。",
        );
        refresh();
      } else if (data.type === "experiment-result") {
        setReport(data.report);
        setTab("experiments");
        setMessage("十二条件实验完成。报告使用合成参数，尚未标定。");
      } else if (data.type === "structure-result") {
        setStructure(data.report);
        setTab("experiments");
        setMessage("四种学习结构对照完成。全部仍为合成机制假设。");
      } else if (data.type === "sensitivity-result") {
        setSensitivity(data.report);
        setTab("experiments");
        setMessage("敏感性筛查与交互网格完成。");
      } else if (data.type === "cancelled")
        setMessage("已取消计算，已保存的档案继续保留。");
      else setError(data.message ?? "计算未完成。");
    };
    engine.onerror = (event) => {
      setBusy(false);
      setError(`后台计算线程未启动：${event.message}`);
    };
    refresh();
    loadLives()
      .then(setLegacy)
      .catch(() => {});
    return () => {
      engine.terminate();
      worker.current = null;
    };
  }, []);
  useEffect(() => {
    if (!playing || !run) return;
    const timer = setInterval(
      () =>
        setCursor((value) => {
          if (value >= run.config.months) {
            setPlaying(false);
            return value;
          }
          return value + 1;
        }),
      220,
    );
    return () => clearInterval(timer);
  }, [playing, run]);
  const begin = (request: WorkerRequest) => {
    if (busy) return;
    setBusy(true);
    setPlaying(false);
    setError("");
    setMessage("");
    setProgress({ completed: 0, total: 1, label: "准备计算" });
    worker.current?.postMessage(request);
  };
  const start = (config: ScenarioConfig) => {
    branchParent.current = null;
    begin({ type: "run", config });
  };
  const jump = (month: number) => {
    setPlaying(false);
    setCursor(month);
  };
  const restore = async (id: string) => {
    try {
      const result = await loadWorldRun(id);
      if (!result) throw new Error("档案不存在。");
      setRun(result);
      setPersonId(result.config.trackedIds[0]);
      setInitial(result.config);
      setCursor(saved.find((s) => s.id === id)?.cursor ?? 0);
      setSetup(false);
      setLegacySelected(null);
      setPlaying(false);
      setTab("life");
      setParent(result.parent ? await loadWorldRun(result.parent.runId) : null);
      setError("");
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error));
    }
  };
  const importArchive = async (file: File) => {
    try {
      const value = JSON.parse(await file.text());
      if (value.format === "social-structure/2") {
        setStructure(value);
        setTab("experiments");
        return;
      }
      if (value.format === "social-experiment/2") {
        setReport(value);
        setTab("experiments");
        setMessage("已导入实验报告。参数仍未标定。");
        return;
      }
      if (value.format === "social-sensitivity/2") {
        setSensitivity(value);
        setTab("experiments");
        return;
      }
      if (
        typeof value.seed === "string" &&
        value.parameters &&
        !value.finalWorld
      ) {
        validateParameters(value.parameters);
        setInitial(defaultScenario(value));
        setSetup(true);
        setTab("life");
        setMessage("已导入世界配置，可调整后重新计算 V2 社会。");
        return;
      }
      const result = validateArchive(value);
      setRun(result);
      setParent(null);
      setPersonId(result.config.trackedIds[0]);
      setCursor(0);
      setInitial(result.config);
      setSetup(false);
      setTab("life");
      await saveWorldRun(result);
      await refresh();
      setMessage("已导入 V2 世界；首次分支时会重建缺失的年度检查点。");
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error));
    }
  };
  const save = async () => {
    if (!run) return;
    try {
      await saveWorldRun(run, cursor);
      await refresh();
      setMessage("已保存世界与当前观察月份。");
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error));
    }
  };
  const frame = run ? projectLife(run, personId, cursor).frame : null,
    metric = run?.metrics[cursor];
  const selectedTab = TABS.find((t) => t.id === tab)!;
  return (
    <div className="social-app">
      <aside className="sl-sidebar">
        <a
          className="sl-brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            setTab("life");
          }}
        >
          <span className="sl-brand-mark">✳</span>
          <span>
            LabX<small>人类处境观察计划</small>
          </span>
          <b>02</b>
        </a>
        <div className="sl-nav-label">观察与实验</div>
        <nav>
          {TABS.map((t) => (
            <button
              key={t.id}
              className={tab === t.id ? "active" : ""}
              onClick={() => {
                setTab(t.id);
                setLegacySelected(null);
              }}
            >
              <t.icon size={19} />
              <span>
                {t.label}
                <small>{t.en}</small>
              </span>
              {tab === t.id && <ChevronRight size={13} />}
            </button>
          ))}
        </nav>
        <div className="sl-sidebar-world">
          <span className="sl-status-dot" />
          <span>
            {run ? run.config.seed : "尚未创建世界"}
            <small>
              {run
                ? `${run.config.population} 人起始 · ${MODEL_NAMES[run.config.model]}`
                : "本地计算 · 无大模型"}
            </small>
          </span>
        </div>
        <div className="sl-sidebar-note">
          <FlaskConical size={19} />
          <strong>机制实验版本</strong>
          <p>
            合成参数尚未标定。
            <br />
            理解机制，从可检验的假设开始。
          </p>
        </div>
        <div className="sl-sidebar-bottom">
          <span>GameX / LabX</span>
          <span>LOCAL · V2</span>
        </div>
      </aside>
      <main className="sl-main">
        <header className="sl-topbar">
          <div className="sl-breadcrumb">
            虚拟社会 <ChevronRight size={12} />
            <strong>{selectedTab.label}</strong>
          </div>
          <div className="sl-actions">
            <button
              className="sl-secondary"
              onClick={() => input.current?.click()}
              disabled={busy}
            >
              <Upload size={15} />
              <span>导入</span>
            </button>
            {run && (
              <>
                <button className="sl-secondary" disabled={busy} onClick={save}>
                  <Save size={15} />
                  <span>保存</span>
                </button>
                <details
                  className="sl-export-menu"
                  onClick={(event) => {
                    if ((event.target as Element).closest("button"))
                      event.currentTarget.removeAttribute("open");
                  }}
                >
                  <summary>
                    <Download size={15} />
                    <span>导出</span>
                  </summary>
                  <div>
                    <button onClick={() => exportWorld(run)}>
                      完整世界 JSON
                    </button>
                    <button
                      onClick={() => exportWorldHtml(run, personId, cursor)}
                    >
                      当前观察 HTML
                    </button>
                    <button
                      onClick={() =>
                        downloadFile(
                          "世界配置.json",
                          JSON.stringify(run.config, null, 2),
                        )
                      }
                    >
                      实验配置 JSON
                    </button>
                  </div>
                </details>
              </>
            )}
            <button
              className="sl-primary"
              disabled={busy}
              onClick={() => {
                setSetup(!setup);
                setTab("life");
                setLegacySelected(null);
              }}
            >
              <Plus size={16} />
              <span>新建社会</span>
            </button>
          </div>
        </header>
        <input
          ref={input}
          type="file"
          accept=".json,application/json"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) importArchive(file);
            e.target.value = "";
          }}
        />
        <div className="sl-content">
          <section className="sl-page-heading">
            <div>
              <div className="sl-kicker">
                {selectedTab.en} / SOCIAL SIMULATION V2
              </div>
              <h1>
                {tab === "life"
                  ? "一种人生，身处同一个社会"
                  : selectedTab.label}
                <span>.</span>
              </h1>
              <p>
                {tab === "life"
                  ? "从十五岁出发，观察选择怎样被经历、关系与共同的资源塑造。"
                  : "保留计算依据，让人物变化与社会结果都可以追溯。"}
              </p>
            </div>
            <span className="sl-calibration">
              <span />
              合成机制 · 未标定
            </span>
          </section>
          {error && (
            <div className="sl-notice sl-error" role="alert">
              {error}
              <button aria-label="关闭错误" onClick={() => setError("")}>
                <X size={16} />
              </button>
            </div>
          )}
          {message && (
            <div className="sl-notice" role="status">
              <Check size={17} />
              <span>{message}</span>
              <button aria-label="关闭提示" onClick={() => setMessage("")}>
                <X size={15} />
              </button>
            </div>
          )}
          {busy && (
            <section className="sl-progress sl-card" role="status">
              <LoaderCircle className="sl-spin" size={23} />
              <div>
                <strong>{progress.label}</strong>
                <span>
                  {progress.completed} / {progress.total}
                </span>
                <progress value={progress.completed} max={progress.total} />
              </div>
              <button
                className="sl-secondary"
                onClick={() => worker.current?.postMessage({ type: "cancel" })}
              >
                取消计算
              </button>
            </section>
          )}
          {tab === "life" && setup && (
            <div className="sl-setup-grid">
              <SocialConfig
                key={JSON.stringify(initial)}
                initial={initial}
                onStart={start}
                busy={busy}
              />
              <aside className="sl-world-intro">
                <div className="sl-world-graphic" aria-hidden="true">
                  <div className="sl-orbit o1" />
                  <div className="sl-orbit o2" />
                  <div className="sl-orbit o3" />
                  <div className="sl-planet-center">
                    <Globe2 size={39} />
                    <span>共同的社会</span>
                  </div>
                  {["家庭", "学校", "企业", "关系"].map((name, i) => (
                    <span key={name} className={`sl-planet p${i}`}>
                      {name}
                    </span>
                  ))}
                </div>
                <span className="sl-kicker">A SOCIETY, NOT A SCRIPT</span>
                <h2>
                  机会会被占用。
                  <br />
                  经历会被记住。
                </h2>
                <p>
                  人物按自己的观察和信念行动。组织回应、家庭账本与关系网络一起决定下一次处境。
                </p>
                <div className="sl-intro-stats">
                  <span>
                    <b>04</b>月内子步
                  </span>
                  <span>
                    <b>03</b>人格对照
                  </span>
                  <span>
                    <b>00</b>大模型调用
                  </span>
                </div>
              </aside>
            </div>
          )}
          {run &&
            metric &&
            frame &&
            ["life", "archive", "compare", "accounts"].includes(tab) &&
            !legacySelected && (
              <>
                <MetricStrip metric={metric} />
                <section className="sl-player sl-card">
                  <div className="sl-player-top">
                    <div>
                      <span className="sl-status-dot" />
                      <strong>第 {cursor} 月</strong>
                      <small>
                        观察人物{" "}
                        {(
                          ((frame.person.diedMonth ?? cursor) -
                            frame.person.birthMonth) /
                          12
                        ).toFixed(1)}{" "}
                        岁{!frame.person.alive ? " · 行动已停止" : ""}
                      </small>
                    </div>
                    <label>
                      观察人物
                      <select
                        aria-label="观察人物"
                        value={personId}
                        onChange={(e) => setPersonId(e.target.value)}
                      >
                        {run.config.trackedIds.map((id) => (
                          <option key={id} value={id}>
                            {run.frames[id]?.[0]?.person.name ?? id}
                          </option>
                        ))}
                      </select>
                    </label>
                    <span className="sl-player-rule">
                      {MODEL_NAMES[run.config.model]} · 同种子可复现
                    </span>
                  </div>
                  <div className="sl-player-controls">
                    <button
                      className="sl-play"
                      aria-label={playing ? "暂停观察" : "播放观察"}
                      onClick={() => {
                        if (cursor === run.config.months) setCursor(0);
                        setPlaying(!playing);
                      }}
                    >
                      {playing ? <Pause size={17} /> : <Play size={17} />}
                    </button>
                    <button
                      className="sl-icon-button"
                      aria-label="上一年"
                      onClick={() => jump(Math.max(0, cursor - 12))}
                    >
                      <ArrowLeft size={16} />
                    </button>
                    <input
                      aria-label="观察月份"
                      type="range"
                      min="0"
                      max={run.config.months}
                      value={cursor}
                      onChange={(e) => jump(Number(e.target.value))}
                    />
                    <button
                      className="sl-icon-button"
                      aria-label="下一年"
                      onClick={() =>
                        jump(Math.min(run.config.months, cursor + 12))
                      }
                    >
                      <ArrowRight size={16} />
                    </button>
                    <label className="sl-month-number">
                      月
                      <input
                        aria-label="跳转月份"
                        type="number"
                        min="0"
                        max={run.config.months}
                        value={cursor}
                        onChange={(e) =>
                          jump(
                            Math.max(
                              0,
                              Math.min(
                                run.config.months,
                                Math.floor(Number(e.target.value)),
                              ),
                            ),
                          )
                        }
                      />
                    </label>
                  </div>
                </section>
                <div
                  className={
                    tab === "life" || tab === "archive" ? "sl-observe-grid" : ""
                  }
                >
                  {(tab === "life" || tab === "archive") && (
                    <PersonOverview frame={frame} run={run} />
                  )}
                  <div className="sl-view">
                    {tab === "life" && (
                      <SocialTimeline
                        run={run}
                        personId={personId}
                        cursor={cursor}
                      />
                    )}
                    {tab === "archive" && (
                      <SocialArchive run={run} frame={frame} />
                    )}
                    {tab === "accounts" && (
                      <SocialAccounts
                        run={run}
                        cursor={cursor}
                        personId={personId}
                      />
                    )}
                    {tab === "compare" && (
                      <SocialComparison
                        run={run}
                        parent={parent}
                        cursor={cursor}
                        personId={personId}
                        busy={busy}
                        onJump={jump}
                        onBranch={(punitive, learning) => {
                          branchParent.current = run;
                          begin({
                            type: "branch",
                            parent: run,
                            month: cursor,
                            intervention: {
                              id: `ρ=${punitive} · 信念${learning ? "开" : "关"}`,
                              fromMonth: cursor + 1,
                              punitive,
                              lockPolicy: true,
                              parameters: {
                                beliefLearning: learning,
                                habitLearning: false,
                                institutionLearning: false,
                              },
                            },
                          });
                        }}
                      />
                    )}
                  </div>
                </div>
              </>
            )}
          {!run && ["archive", "compare", "accounts"].includes(tab) && (
            <section className="sl-card sl-empty">
              <Globe2 size={38} />
              <h2>先创建一个共享社会</h2>
              <p>计算完成后，可以观察人物、核对账本并建立完整世界分支。</p>
              <button
                className="sl-primary"
                onClick={() => {
                  setTab("life");
                  setSetup(true);
                }}
              >
                设置新社会 <ArrowRight size={16} />
              </button>
            </section>
          )}
          {tab === "parameters" && <ParameterSources run={run} />}
          {tab === "experiments" && (
            <SocialExperiments
              busy={busy}
              report={report}
              sensitivity={sensitivity}
              structure={structure}
              onStructure={(spec) => begin({ type: "structure", spec })}
              initialPopulation={initial.population}
              initialSeed={initial.seed}
              onRun={(spec) => begin({ type: "experiment", spec })}
              onSensitivity={(options) =>
                begin({ type: "sensitivity", options })
              }
            />
          )}
          {tab === "library" && (
            <div className="sl-stack">
              <section className="sl-card">
                <div className="sl-section-title">
                  <div>
                    <span className="sl-kicker">WORLD COLLECTION</span>
                    <h2>保存在这台设备里的社会</h2>
                  </div>
                  <FolderOpen size={23} />
                </div>
                <p className="sl-muted">
                  V2
                  保存完整世界与年度检查点。清除浏览器数据会移除本地档案，请用
                  JSON 备份。
                </p>
                {saved.length ? (
                  <div className="sl-saved-list">
                    {saved.map((s) => (
                      <article key={s.id}>
                        <span className="sl-saved-icon">
                          <Globe2 size={22} />
                        </span>
                        <div>
                          <h3>{s.name}</h3>
                          <p>
                            {s.population} 人起始 ·{" "}
                            {MODEL_NAMES[s.model as keyof typeof MODEL_NAMES]} ·{" "}
                            {s.month} 月 ·{" "}
                            {new Date(s.savedAt).toLocaleString("zh-CN")}
                          </p>
                        </div>
                        <button
                          className="sl-secondary"
                          disabled={busy}
                          onClick={() => restore(s.id)}
                        >
                          恢复
                        </button>
                        <button
                          className="sl-icon-button"
                          aria-label={`移除 ${s.name}`}
                          disabled={busy}
                          onClick={async () => {
                            await deleteWorldRun(s.id);
                            await refresh();
                            setMessage("本地世界档案已移除。");
                          }}
                        >
                          <X size={16} />
                        </button>
                      </article>
                    ))}
                  </div>
                ) : (
                  <p className="sl-empty">尚无 V2 本地档案。</p>
                )}
              </section>
              <section className="sl-card">
                <span className="sl-kicker">LEGACY / READ ONLY</span>
                <h2>V1 人生档案</h2>
                <p className="sl-muted">
                  旧版单人人生保留为只读记录。可复用十五岁初始配置创建新社会，不能将旧中途快照转换成共享社会。
                </p>
                {legacy.length ? (
                  legacy.map((s) => (
                    <div className="sl-legacy-row" key={s.id}>
                      <strong>{s.run.name}</strong>
                      <button
                        className="sl-secondary"
                        onClick={() => {
                          setLegacySelected(s);
                          setLegacyCursor(s.cursor);
                        }}
                      >
                        只读查看
                      </button>
                      <button
                        className="sl-secondary"
                        disabled={busy}
                        onClick={() => {
                          const c = s.run.character;
                          setInitial(
                            defaultScenario({
                              seed: c.seed,
                              focalName: c.name,
                              focal: {
                                jung8: c.scores,
                                gender: c.gender,
                                region: c.region,
                                familyResources: c.familyResources,
                              },
                            }),
                          );
                          setSetup(true);
                          setTab("life");
                          setLegacySelected(null);
                        }}
                      >
                        用初始配置新建 V2
                      </button>
                    </div>
                  ))
                ) : (
                  <p className="sl-footnote">
                    没有检测到当前规则版本可读取的 V1 档案。
                  </p>
                )}
              </section>
            </div>
          )}
          {legacySelected && tab === "library" && (
            <section className="sl-card sl-legacy-view">
              <h2>{legacySelected.run.name} · V1 只读</h2>
              <label>
                旧人生月份 {legacyCursor}
                <input
                  type="range"
                  min="0"
                  max="540"
                  value={legacyCursor}
                  onChange={(e) => setLegacyCursor(Number(e.target.value))}
                />
              </label>
              <Archive
                run={legacySelected.run}
                state={legacySelected.run.snapshots[legacyCursor]}
                onJump={setLegacyCursor}
              />
              <Timeline
                run={legacySelected.run}
                cursor={legacyCursor}
                onJump={setLegacyCursor}
              />
            </section>
          )}
          <footer className="sl-footer">
            <span>
              <Activity size={13} />
              确定性计算 · 资源守恒 · 无大模型
            </span>
            <span>synthetic-v2 / 机制可检验，现实效度待验证</span>
          </footer>
        </div>
      </main>
    </div>
  );
}
