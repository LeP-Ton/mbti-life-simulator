import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowDownToLine,
  ArrowLeftRight,
  ArrowRight,
  BookOpen,
  Check,
  ChevronDown,
  CircleHelp,
  Download,
  Flag,
  FolderHeart,
  GitBranch,
  Heart,
  Leaf,
  Menu,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Save,
  SkipForward,
  Sprout,
  Star,
  Trash2,
  X,
} from "lucide-react";
import { Archive } from "./components/Archive";
import { Compare, type ComparisonKind } from "./components/Compare";
import { BranchDialog, ConfigDialog, Modal } from "./components/Dialogs";
import { PersonCard } from "./components/PersonCard";
import { StageRail, Timeline } from "./components/Timeline";
import { Avatar, LifeIllustration, Sparkline } from "./components/Visuals";
import {
  defaultConfig,
  monthLabel,
  moneyLabel,
  randomConfig,
  STAGE_NAMES,
  TOTAL_MONTHS,
} from "./simulation/config";
import { branchLife, environmentAt, generateLife } from "./simulation/engine";
import {
  generateScores,
  inferMbtiFromFunctions,
  TYPES,
} from "./simulation/personality";
import { CHAINS, EVENT_TEMPLATES } from "./simulation/events";
import type { Environment, LifeRun, PersonConfig } from "./simulation/types";
import { deleteLife, loadLives, saveLife } from "./lib/storage";
import { exportLifeHtml, exportLifeJson } from "./lib/export";

type Tab = "timeline" | "archive" | "compare";
type Dialog =
  "config" | "branch" | "save" | "collection" | "help" | "export" | null;
const NAVIGATION = [
  {
    id: "timeline",
    name: "人生时间线",
    subtitle: "观察每一个转折",
    icon: Leaf,
  },
  {
    id: "archive",
    name: "发展档案",
    subtitle: "积累，不只在分数里",
    icon: BookOpen,
  },
  {
    id: "compare",
    name: "平行人生",
    subtitle: "换个起点，看见不同",
    icon: ArrowLeftRight,
  },
] as const;

export default function App() {
  const [runs, setRuns] = useState<LifeRun[]>(() => [
    generateLife(defaultConfig()),
  ]);
  const [selectedId, setSelectedId] = useState("");
  const [cursor, setCursor] = useState(0);
  const [tab, setTab] = useState<Tab>("timeline");
  const [dialog, setDialog] = useState<Dialog>(null);
  const [playing, setPlaying] = useState(false),
    [speed, setSpeed] = useState(3);
  const [pauseMajor, setPauseMajor] = useState(false);
  const [otherId, setOtherId] = useState("");
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [saveName, setSaveName] = useState("");
  const [busy, setBusy] = useState(false),
    [toast, setToast] = useState("");
  const [menuOpen, setMenuOpen] = useState(false),
    [showNotice, setShowNotice] = useState(true);
  const cursorMemory = useRef<Record<string, number>>({});
  const mainRef = useRef<HTMLElement>(null);
  const current = runs.find((run) => run.id === selectedId) ?? runs[0];
  const state = current.snapshots[cursor];
  const notify = useCallback((message: string) => setToast(message), []);
  const closeDialog = useCallback(() => setDialog(null), []);
  const openDialog = (value: Dialog) => {
    setPlaying(false);
    setDialog(value);
  };

  useEffect(() => {
    loadLives()
      .then((entries) => {
        if (entries.length) {
          setRuns(entries.map((entry) => entry.run));
          setSelectedId(entries[0].id);
          setCursor(entries[0].cursor);
          cursorMemory.current = Object.fromEntries(
            entries.map((entry) => [entry.id, entry.cursor]),
          );
          setSavedIds(new Set(entries.map((entry) => entry.id)));
        }
      })
      .catch((error) => notify(error.message));
  }, [notify]);
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(""), 4200);
      return () => clearTimeout(timer);
    }
  }, [toast]);
  useEffect(() => {
    if (!playing) return;
    const timer = setInterval(() => {
      let next = Math.min(TOTAL_MONTHS, cursor + speed);
      const major = pauseMajor
        ? current.events.find(
            (event) =>
              event.important && event.month > cursor && event.month <= next,
          )
        : undefined;
      if (major) next = major.month;
      setCursor(next);
      if (next === TOTAL_MONTHS || major) setPlaying(false);
    }, 440);
    return () => clearInterval(timer);
  }, [playing, cursor, speed, current, pauseMajor]);
  useEffect(() => {
    cursorMemory.current[current.id] = cursor;
  }, [cursor, current.id]);

  const jump = (month: number) => {
    setPlaying(false);
    setCursor(Math.max(0, Math.min(TOTAL_MONTHS, month)));
  };
  const selectRun = (id: string) => {
    setPlaying(false);
    setSelectedId(id);
    setCursor(cursorMemory.current[id] ?? 0);
    setMenuOpen(false);
  };
  const addRuns = (next: LifeRun[], activate = true) => {
    const unique = next.filter(
      (run) => !runs.some((item) => item.id === run.id),
    );
    if (runs.length + unique.length > 16) {
      notify("观察室最多容纳十六名人物，请先移除一段人生。");
      return false;
    }
    if (!unique.length) {
      notify("相同配置的人生已在观察室中，已为你打开。");
      if (activate) {
        setSelectedId(next[0].id);
        setCursor(0);
      }
      return true;
    }
    setRuns((previous) => [...previous, ...unique]);
    if (activate) {
      setSelectedId(unique[0].id);
      setCursor(0);
    }
    return true;
  };
  const create = (config: PersonConfig, count: number) => {
    setBusy(true);
    setTimeout(() => {
      try {
        const generated = Array.from({ length: count }, (_, index) => {
          if (index === 0) return generateLife(config);
          const seed = `${config.seed}-B${index + 1}`,
            other = randomConfig(seed);
          return generateLife({
            ...config,
            ...other,
            environment: config.environment,
            scores: generateScores(seed, inferType(config)),
          });
        });
        if (addRuns(generated)) {
          setDialog(null);
          setTab("timeline");
          setPlaying(true);
          notify(`已生成 ${count} 段完整人生，正在自动回放。`);
        }
      } catch (error) {
        notify((error as Error).message);
      } finally {
        setBusy(false);
      }
    }, 50);
  };
  const createBranch = (environment: Environment) => {
    setBusy(true);
    setTimeout(() => {
      try {
        const branch = branchLife(current, cursor, environment);
        if (addRuns([branch], false)) {
          setOtherId(branch.id);
          setDialog(null);
          setTab("compare");
          notify(`已从${monthLabel(cursor)}创建分支，原人生完整保留。`);
        }
      } catch (error) {
        notify((error as Error).message);
      } finally {
        setBusy(false);
      }
    }, 50);
  };
  const compare = (kind: ComparisonKind) => {
    if (kind === "environment") {
      openDialog("branch");
      return;
    }
    if (runs.length >= 16) {
      notify("观察室已满，请先移除一段人生。");
      return;
    }
    const {
      id: _id,
      inference: _inference,
      generationVersion: _generation,
      ...identity
    } = current.character;
    let config: PersonConfig = {
      ...identity,
      environment: current.initialEnvironment,
    };
    const suffix = runs.length;
    if (kind === "type") {
      const currentIndex = TYPES.indexOf(
        current.character.inference.type ?? "INFP",
      );
      const offset = 1 + ((suffix + 4) % (TYPES.length - 1));
      const target = TYPES[(currentIndex + offset) % TYPES.length];
      config = {
        ...config,
        scores: generateScores(`${identity.seed}-TYPE-${suffix}`, target),
      };
    } else if (kind === "origin")
      config = {
        ...config,
        name: `${identity.name.slice(0, 3)}·另一起点`,
        familyResources: identity.familyResources > 50 ? 22 : 82,
        expectation:
          identity.expectation === "支持探索" ? "尽早稳定" : "支持探索",
        region: identity.region === "远岚县" ? "青屿市" : "远岚县",
      };
    else config = { ...config, seed: `${identity.seed}-R${suffix}` };
    const other = generateLife(config);
    if (addRuns([other], false)) {
      setOtherId(other.id);
      setTab("compare");
      notify("对照已生成，两个视图共用下方的月份游标。");
    }
  };
  const handleSave = async () => {
    const renamed = {
      ...current,
      name: saveName.trim() || `${current.character.name}的人生`,
    };
    setBusy(true);
    try {
      await saveLife(renamed, cursor);
      setRuns((previous) =>
        previous.map((run) => (run.id === current.id ? renamed : run)),
      );
      setSavedIds((previous) => new Set([...previous, current.id]));
      setDialog(null);
      notify("人生与播放位置已保存在此浏览器的本地档案库。");
    } catch (error) {
      notify((error as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const favorite = async (run: LifeRun) => {
    const updated = { ...run, favorite: !run.favorite };
    try {
      if (savedIds.has(run.id))
        await saveLife(updated, cursorMemory.current[run.id] ?? 0);
      setRuns((previous) =>
        previous.map((item) => (item.id === run.id ? updated : item)),
      );
    } catch (error) {
      notify((error as Error).message);
    }
  };
  const remove = async (run: LifeRun) => {
    if (runs.length === 1) {
      notify("观察室至少保留一段人生，可以先创建新人物。");
      return;
    }
    try {
      if (savedIds.has(run.id)) await deleteLife(run.id);
      setRuns((previous) => previous.filter((item) => item.id !== run.id));
      setSavedIds(
        (previous) => new Set([...previous].filter((id) => id !== run.id)),
      );
      if (current.id === run.id) {
        setSelectedId(runs.find((item) => item.id !== run.id)!.id);
        setCursor(0);
      }
      notify("已移除这段人生，其余人物保持不变。");
    } catch (error) {
      notify((error as Error).message);
    }
  };
  const saveDialog = () => {
    setSaveName(current.name);
    openDialog("save");
  };
  const nextTurning = () =>
    jump(
      current.events.find((event) => event.month > cursor && event.important)
        ?.month ?? TOTAL_MONTHS,
    );
  const endStage = () => {
    const next = current.snapshots.find(
      (snapshot) => snapshot.month > cursor && snapshot.stage !== state.stage,
    );
    jump(
      next
        ? next.month - 1 <= cursor
          ? next.month
          : next.month - 1
        : TOTAL_MONTHS,
    );
  };
  const metricSnapshots = current.snapshots
    .slice(0, cursor + 1)
    .filter((_, index) => index % 6 === 0 || index === cursor);

  return (
    <div className="app-shell">
      <header className="topbar">
        <a
          href="#"
          className="brand"
          onClick={(event) => {
            event.preventDefault();
            setTab("timeline");
          }}
        >
          <span className="brand-icon">
            <Sprout size={23} />
          </span>
          <span>
            Game<span className="brand-x">X</span>
            <small>LABX 的人生实验场</small>
          </span>
        </a>
        <div className="topbar-center">
          <span className="season-mark">✳</span> 观察人生的另一种可能
        </div>
        <div className="topbar-actions">
          <button className="text-button" onClick={() => openDialog("help")}>
            <CircleHelp size={15} />
            <span>玩法与设定</span>
          </button>
          <span className="topbar-divider" />
          <span className="local-status">
            <i />
            本地模拟
          </span>
          <button
            className="mobile-menu icon-button"
            aria-label="打开导航"
            onClick={() => setMenuOpen(!menuOpen)}
          >
            <Menu size={21} />
          </button>
        </div>
      </header>
      <aside className={`sidebar ${menuOpen ? "sidebar-open" : ""}`}>
        <div className="workspace-label">
          我的观察室 <span>01</span>
        </div>
        <nav>
          {NAVIGATION.map(({ id, name, subtitle, icon: Icon }) => (
            <button
              key={id}
              className={tab === id ? "active" : ""}
              onClick={() => {
                setTab(id);
                setMenuOpen(false);
              }}
            >
              <Icon size={19} />
              <span>
                {name}
                <small>{subtitle}</small>
              </span>
              {tab === id && <i />}
            </button>
          ))}
        </nav>
        <div className="sidebar-divider" />
        <div className="roster-heading">
          <span>
            正在观察 <small>{runs.length}/16</small>
          </span>
          <button
            className="icon-button"
            aria-label="添加人物"
            title="添加人物"
            onClick={() => openDialog("config")}
            disabled={runs.length >= 16}
          >
            <Plus size={16} />
          </button>
        </div>
        <div className="roster-list">
          {runs.map((run) => (
            <button
              className={`roster-item ${current.id === run.id ? "active" : ""}`}
              key={run.id}
              onClick={() => selectRun(run.id)}
            >
              <Avatar character={run.character} small />
              <span>
                <strong>
                  {run.character.name}
                  {run.favorite && <Star size={10} fill="currentColor" />}
                </strong>
                <small>
                  {run.character.inference.type ?? "待区分"} ·{" "}
                  {run.branch ? "环境分支" : "独立人生"}
                </small>
              </span>
              {current.id === run.id && <i />}
            </button>
          ))}
        </div>
        <button
          className="sidebar-new"
          onClick={() => openDialog("config")}
          disabled={runs.length >= 16}
        >
          <Plus size={15} />
          添加一段人生
        </button>
        <div className="sidebar-bottom">
          <button onClick={() => openDialog("collection")}>
            <FolderHeart size={18} />
            我的人生收藏<span>{savedIds.size}</span>
          </button>
          <div className="sidebar-quote">
            <Sprout size={23} />
            <p>
              人格是种子，
              <br />
              人生不止一种生长。
            </p>
            <span>NO SINGLE RIGHT WAY.</span>
          </div>
          <p className="sidebar-version">
            GameX · 观察版 1.0 <span>↗</span>
          </p>
        </div>
      </aside>
      <main className="main-content" ref={mainRef}>
        <div className="page-toolbar">
          <div className="breadcrumbs">
            我的观察室 <span>/</span>
            <b>
              {tab === "timeline"
                ? "人生时间线"
                : tab === "archive"
                  ? "发展档案"
                  : "平行人生"}
            </b>
          </div>
          <div>
            <button className="button button-quiet" onClick={saveDialog}>
              <Save size={15} />
              保存人生
            </button>
            <button
              className="button button-primary"
              onClick={() => openDialog("config")}
              disabled={runs.length >= 16}
            >
              <Plus size={16} />
              新的人生
            </button>
          </div>
        </div>
        <section className="hero">
          <div className="hero-copy">
            <span className="eyebrow">
              <span /> LIFE IS MORE THAN FOUR LETTERS
            </span>
            <h1>
              MBTI <span>人生模拟</span>
              <i>✳</i>
            </h1>
            <p>一种人格，不止一种人生。</p>
            <div className="hero-description">
              从十五岁出发，看选择与环境，
              <br className="hero-break" />
              如何慢慢长成一个人的故事。
            </div>
            <div className="hero-chips">
              <span>
                <Sprout size={12} />
                人物自主选择
              </span>
              <span>
                <GitBranch size={12} />
                可回放的因果
              </span>
              <span>
                <Heart size={12} />
                没有唯一标准答案
              </span>
            </div>
          </div>
          <LifeIllustration />
          <span className="hero-corner">人生观察计划 / VOL. 01</span>
        </section>
        {showNotice && (
          <div className="notice">
            <span className="notice-icon">✦</span>
            <p>
              <b>把方向交给人物，把好奇留给你。</b>{" "}
              点击播放后，学习、升学和工作都将自动发生。你可以暂停、回看，也可以换个环境重新观察。
            </p>
            <button
              className="icon-button"
              aria-label="关闭玩法提示"
              onClick={() => setShowNotice(false)}
            >
              <X size={14} />
            </button>
          </div>
        )}
        <div className="observation-heading">
          <div>
            <h2>
              {current.character.name}的人生
              <span className="outline-badge">
                {current.branch ? "环境分支" : "自动观察"}
              </span>
            </h2>
            <p>
              当前{monthLabel(cursor)} <span>·</span> {STAGE_NAMES[state.stage]}{" "}
              <span>·</span> {environmentAt(current, cursor).name}
            </p>
          </div>
          <div>
            <button
              className={`icon-button favorite-button ${current.favorite ? "is-favorite" : ""}`}
              aria-label={current.favorite ? "取消收藏" : "收藏人生"}
              title={current.favorite ? "取消收藏" : "收藏人生"}
              onClick={() => favorite(current)}
            >
              <Star
                size={17}
                fill={current.favorite ? "currentColor" : "none"}
              />
            </button>
            <button
              className="button button-outline"
              onClick={() => openDialog("export")}
            >
              <ArrowDownToLine size={15} />
              导出档案
            </button>
          </div>
        </div>
        <div className="metrics-grid">
          <div className="metric-card">
            <span>
              <BookOpen size={14} />
              学习与实践
            </span>
            <strong>
              {(
                state.development.studyHours + state.development.practiceHours
              ).toLocaleString()}
              <small>小时</small>
            </strong>
            <p>
              {state.development.works.length} 份作品 ·{" "}
              {state.development.credentials.length} 段学习记录
            </p>
            <Sparkline
              values={metricSnapshots.map(
                (snapshot) =>
                  snapshot.development.studyHours +
                  snapshot.development.practiceHours,
              )}
              fill
            />
          </div>
          <div className="metric-card">
            <span>
              <span className="metric-currency">¥</span>可用经济资源
            </span>
            <strong>{moneyLabel(state.dynamic.money)}</strong>
            <p>
              {state.job
                ? `当前月收入 ${moneyLabel(state.job.salary)}`
                : state.stage === "school" || state.stage === "preparation"
                  ? "家庭支持与学习支出共同变化"
                  : "求职与日常生活的缓冲"}
            </p>
            <Sparkline
              values={metricSnapshots.map((snapshot) => snapshot.dynamic.money)}
              color="#b19361"
              fill
            />
          </div>
          <div className="metric-card">
            <span>
              <GitBranch size={14} />
              自主空间
            </span>
            <strong>
              {Math.round(state.dynamic.autonomy)}
              <small>/ 100</small>
            </strong>
            <p>
              {state.opportunityCount} 次可见机会 · {state.blockedCount}{" "}
              次预筛选关闭
            </p>
            <Sparkline
              values={metricSnapshots.map(
                (snapshot) => snapshot.dynamic.autonomy,
              )}
              color="#7c9b9b"
              fill
            />
          </div>
          <div className="metric-card">
            <span>
              <Heart size={14} />
              生活满意度
            </span>
            <strong>
              {Math.round(state.dynamic.satisfaction)}
              <small>/ 100</small>
            </strong>
            <p>
              关键关系 {state.development.relations.length} 段 · 关系状态{" "}
              {Math.round(state.dynamic.connection)}
            </p>
            <Sparkline
              values={metricSnapshots.map(
                (snapshot) => snapshot.dynamic.satisfaction,
              )}
              color="#be907c"
              fill
            />
          </div>
        </div>
        <StageRail run={current} cursor={cursor} onJump={jump} />
        <div className="observer-preferences">
          <span>按年度聚合记录，展开可回看原因</span>
          <label>
            <input
              type="checkbox"
              checked={pauseMajor}
              onChange={(event) => setPauseMajor(event.target.checked)}
            />
            重大节点暂停
          </label>
        </div>
        {tab === "timeline" ? (
          <div className="observation-grid">
            <PersonCard
              run={current}
              state={state}
              onBranch={() => openDialog("branch")}
            />
            <Timeline
              key={current.id}
              run={current}
              cursor={cursor}
              onJump={jump}
            />
          </div>
        ) : tab === "archive" ? (
          <Archive
            run={current}
            state={state}
            onJump={(month) => {
              jump(month);
              setTab("timeline");
            }}
          />
        ) : (
          <Compare
            runs={runs}
            selected={current}
            otherId={otherId}
            cursor={cursor}
            onOther={setOtherId}
            onCreate={compare}
            onJump={jump}
          />
        )}
        <footer className="page-footer">
          <span>
            <Leaf size={13} />
            每一段普通人生，都值得被认真看见。
          </span>
          <p>
            八维与社会机制为游戏设定，不预测现实命运。
            <button onClick={() => openDialog("help")}>了解模型与参考 ↗</button>
          </p>
        </footer>
      </main>
      <section className="player" aria-label="人生播放控制">
        <div className="player-progress">
          <span>15 岁</span>
          <input
            aria-label="人生月份"
            type="range"
            min="0"
            max={TOTAL_MONTHS}
            value={cursor}
            style={
              {
                "--progress": `${(cursor / TOTAL_MONTHS) * 100}%`,
              } as React.CSSProperties
            }
            onChange={(event) => jump(Number(event.target.value))}
          />
          <span>60 岁</span>
        </div>
        <div className="player-controls">
          <div className="player-current">
            <span className={`playing-status ${playing ? "is-playing" : ""}`}>
              <i />
              {cursor === TOTAL_MONTHS
                ? "观察暂告一段落"
                : playing
                  ? "人生正在自动展开"
                  : cursor === 0
                    ? "故事，等你按下播放"
                    : "暂停，看看来时的路"}
            </span>
            <b>
              {monthLabel(cursor)} <small>第 {cursor} / 540 月</small>
            </b>
          </div>
          <div className="playback-buttons">
            <button
              className="icon-button"
              aria-label="从十五岁回放"
              title="从十五岁回放"
              onClick={() => jump(0)}
            >
              <RotateCcw size={17} />
            </button>
            <button
              className="play-button"
              aria-label={
                playing
                  ? "暂停人生"
                  : cursor === TOTAL_MONTHS
                    ? "重新播放"
                    : "开始人生"
              }
              onClick={() => {
                if (cursor === TOTAL_MONTHS) setCursor(0);
                setPlaying(!playing);
              }}
            >
              {playing ? (
                <Pause size={18} fill="currentColor" />
              ) : (
                <Play size={18} fill="currentColor" />
              )}
              <span>
                {playing
                  ? "暂停"
                  : cursor === TOTAL_MONTHS
                    ? "重新播放"
                    : cursor === 0
                      ? "开始人生"
                      : "继续人生"}
              </span>
            </button>
            <label className="speed-select">
              <select
                aria-label="播放速度"
                value={speed}
                onChange={(event) => setSpeed(Number(event.target.value))}
              >
                <option value={1}>1× 逐月</option>
                <option value={3}>3× 季度</option>
                <option value={12}>12× 年度</option>
                <option value={36}>36× 快进</option>
              </select>
              <ChevronDown size={12} />
            </label>
            <button
              className="player-skip"
              onClick={nextTurning}
              title="跳到下一转折"
            >
              <Flag size={14} />
              <span>下一转折</span>
            </button>
            <button
              className="player-skip"
              onClick={endStage}
              title="跳到当前阶段末"
            >
              <SkipForward size={15} />
              <span>阶段末</span>
            </button>
          </div>
          <div className="player-preferences">
            <label>
              <input
                type="checkbox"
                checked={pauseMajor}
                onChange={(event) => setPauseMajor(event.target.checked)}
              />
              重大节点暂停
            </label>
            <button className="text-button" onClick={() => jump(TOTAL_MONTHS)}>
              看完整人生
              <ArrowRight size={13} />
            </button>
          </div>
        </div>
      </section>
      {dialog === "config" && (
        <ConfigDialog
          available={16 - runs.length}
          onCreate={create}
          onClose={closeDialog}
        />
      )}
      {dialog === "branch" && (
        <BranchDialog
          run={current}
          month={cursor}
          onCreate={createBranch}
          onClose={closeDialog}
        />
      )}
      {dialog === "save" && (
        <Modal
          title="把这段人生，留在书架上"
          subtitle="完整记录与当前播放位置保存在当前浏览器，无需账号或联网。"
          onClose={closeDialog}
        >
          <div className="save-body">
            <label>
              档案名称
              <input
                value={saveName}
                maxLength={40}
                onChange={(event) => setSaveName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") handleSave();
                }}
              />
            </label>
            <p className="subtle-note">
              清除浏览器网站数据会删除本地档案，建议同时导出一份完整 JSON 记录。
            </p>
          </div>
          <div className="modal-footer">
            <span>
              {savedIds.has(current.id)
                ? "将更新这份已有档案"
                : `${savedIds.size} / 16 份本地档案`}
            </span>
            <button
              className="button button-primary"
              disabled={busy}
              onClick={handleSave}
            >
              <Save size={15} />
              保存人生
            </button>
          </div>
        </Modal>
      )}
      {dialog === "collection" && (
        <Modal
          title="我的人生书架"
          subtitle="星标用于收藏，保存按钮用于持久存档；未保存的人生在刷新后不会保留。"
          onClose={closeDialog}
          wide
        >
          <div className="collection-list">
            {[...runs]
              .sort((a, b) => Number(b.favorite) - Number(a.favorite))
              .map((run) => (
                <div className="collection-item" key={run.id}>
                  <Avatar character={run.character} small />
                  <button
                    className="collection-title"
                    onClick={() => {
                      selectRun(run.id);
                      closeDialog();
                    }}
                  >
                    <strong>{run.name}</strong>
                    <span>
                      {run.character.inference.type} · {run.environment.name} ·{" "}
                      {savedIds.has(run.id) ? "已存档" : "尚未保存"}
                    </span>
                  </button>
                  <button
                    className={`icon-button ${run.favorite ? "is-favorite" : ""}`}
                    aria-label={`${run.favorite ? "取消收藏" : "收藏"}${run.name}`}
                    onClick={() => favorite(run)}
                  >
                    <Star
                      size={16}
                      fill={run.favorite ? "currentColor" : "none"}
                    />
                  </button>
                  <button
                    className="icon-button delete-button"
                    aria-label={`移除${run.name}`}
                    title="移除这段人生"
                    onClick={() => remove(run)}
                    disabled={runs.length < 2}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
          </div>
        </Modal>
      )}
      {dialog === "export" && (
        <Modal
          title="把经历，带到别处"
          subtitle="导出来自当前模拟记录的真实数据，可以离线查看或分享。"
          onClose={closeDialog}
        >
          <div className="export-options">
            <button
              onClick={() => {
                exportLifeHtml(current, cursor);
                notify("已导出当前月份之前的 HTML 人生年表。");
                closeDialog();
              }}
            >
              <BookOpen size={24} />
              <span>
                <strong>可分享的人生年表</strong>
                <small>
                  HTML · 截至{monthLabel(cursor)} · 可展开因果，也可打印为 PDF
                </small>
              </span>
              <Download size={17} />
            </button>
            <button
              onClick={() => {
                exportLifeJson(current);
                notify("已导出完整人物、事件、快照与规则版本。");
                closeDialog();
              }}
            >
              <Download size={24} />
              <span>
                <strong>完整模拟数据</strong>
                <small>JSON · 完整 540 个月 · 保留八维、种子与所有快照</small>
              </span>
              <Download size={17} />
            </button>
          </div>
        </Modal>
      )}
      {dialog === "help" && (
        <Modal
          title="人生没有唯一的标准答案"
          subtitle="先有一个人，再看他怎样与世界相遇。"
          onClose={closeDialog}
          wide
        >
          <div className="help-body">
            <div className="help-grid">
              <section>
                <h3>01 开始一段人生</h3>
                <p>
                  用默认人物直接播放，或配置姓名、家庭、八维和环境。人物会自动学习、选择路径、求职、协作、转向，直到六十岁。
                </p>
              </section>
              <section>
                <h3>02 停下来，看看原因</h3>
                <p>
                  速度只改变回放游标。展开“查看原因”，能看到发生条件、候选行动、原始表现、外界评价和前因链接。
                </p>
              </section>
              <section>
                <h3>03 换一片土壤</h3>
                <p>
                  环境分支复制当前月份的真实快照，保留未改变的条件与外部随机键。之后的选择和连锁变化由人物重新处理。
                </p>
              </section>
              <section>
                <h3>04 留下多维的结果</h3>
                <p>
                  学习、作品、资源、自主、关系和满意度分别展示。可以普通稳定，也可以持续探索；游戏不给整个人生打一个总分。
                </p>
              </section>
            </div>
            <h3>关于八维与模型</h3>
            <p>
              八维为 0—100
              的游戏内部指数，独立记录、不强制求和。十六类型通过去均值八维向量与四功能序列模板的余弦相似度推导。接近类型与区分度是游戏模板间的差异，不是现实心理判断准确率。
            </p>
            <p>
              经验不自动提高 Si；Ti 不是智商，Te 不是服从，Fe 不是讨好，Ni
              不会预知未来。所有类型都可进入所有实践领域，学习与时间投入才会形成相关经验。
            </p>
            <p>
              地区、性别和家庭不直接进入任务质量公式。偏见通过机会预筛选与组织评价呈现。学校、公司与人物均为原创；规则不代表全国统一政策。
            </p>
            <details>
              <summary>
                {EVENT_TEMPLATES.length} 个基础事件模板 · {CHAINS.length}{" "}
                条后续反馈事件链
              </summary>
              <div className="chain-list">
                {CHAINS.map((chain) => (
                  <p key={chain.id}>
                    <b>{chain.name}</b>：{chain.description}
                  </p>
                ))}
              </div>
            </details>
            <h3>设计参考与边界</h3>
            <p>
              术语核对：
              <a
                href="https://www.myersbriggs.org/unique-features-of-myers-briggs/type-dynamics-processes/"
                target="_blank"
                rel="noreferrer"
              >
                Myers &amp; Briggs Foundation
              </a>
              。八功能画像与多算法呈现参考{" "}
              <a
                href="https://sakinorva.net/functions"
                target="_blank"
                rel="noreferrer"
              >
                Sakinorva
              </a>
              、
              <a
                href="https://www.keys2cognition.com/assessment.html"
                target="_blank"
                rel="noreferrer"
              >
                Keys2Cognition
              </a>
              、
              <a
                href="https://www.michaelcaloz.com/personality/"
                target="_blank"
                rel="noreferrer"
              >
                Michael Caloz
              </a>
              。不复用原题，不混加各站分数，不宣称官方百分制。核对日期：2026 年
              11 月 13 日。
            </p>
            <div className="model-note">
              本游戏为简化的规则模拟，不调用真实大模型，也不需要 API
              Key。人物关系、行业与后期生活仍较简化；六十岁只是本版观察截止点。本游戏不能用于现实个人命运预测。
            </div>
          </div>
        </Modal>
      )}
      {busy && (
        <div className="busy-overlay" role="status">
          <Sprout size={28} />
          <strong>正在让故事慢慢成形…</strong>
          <span>完整生成后，回放速度不会改变人生。</span>
        </div>
      )}
      {toast && (
        <div className="toast" role="status">
          <Check size={16} />
          {toast}
          <button aria-label="关闭通知" onClick={() => setToast("")}>
            <X size={13} />
          </button>
        </div>
      )}
    </div>
  );
}
const inferType = (config: PersonConfig) =>
  inferMbtiFromFunctions(config.scores).type ?? undefined;
