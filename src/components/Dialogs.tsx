import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  Check,
  ChevronDown,
  Dices,
  GitBranch,
  Info,
  Plus,
  Sparkles,
  X,
} from "lucide-react";
import {
  defaultConfig,
  ENVIRONMENTS,
  monthLabel,
  randomConfig,
} from "../simulation/config";
import {
  FUNCTION_INFO,
  generateScores,
  inferMbtiFromFunctions,
  TYPES,
} from "../simulation/personality";
import {
  FUNCTIONS,
  type Environment,
  type LifeRun,
  type Mbti,
  type PersonConfig,
} from "../simulation/types";
import { Radar } from "./Visuals";

export function Modal({
  title,
  subtitle,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    ref.current?.focus();
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (event.key === "Tab") {
        const nodes = ref.current?.querySelectorAll<HTMLElement>(
          "button:not(:disabled), input, select, textarea, summary, [href]",
        );
        if (!nodes?.length) return;
        if (
          event.shiftKey &&
          (document.activeElement === nodes[0] ||
            document.activeElement === ref.current)
        ) {
          event.preventDefault();
          nodes[nodes.length - 1].focus();
        }
        if (
          !event.shiftKey &&
          (document.activeElement === nodes[nodes.length - 1] ||
            document.activeElement === ref.current)
        ) {
          event.preventDefault();
          nodes[0].focus();
        }
      }
    };
    document.addEventListener("keydown", handler);
    return () => {
      document.body.style.overflow = overflow;
      document.removeEventListener("keydown", handler);
      previous?.focus();
    };
  }, [onClose]);
  return (
    <div
      className="modal-overlay"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className={`modal ${wide ? "modal-wide" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        ref={ref}
        tabIndex={-1}
      >
        <div className="modal-header">
          <div>
            <span className="eyebrow">A NEW POSSIBILITY</span>
            <h2>{title}</h2>
            {subtitle && <p>{subtitle}</p>}
          </div>
          <button
            className="icon-button"
            aria-label="关闭弹窗"
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
export function EnvironmentOptions({
  value,
  onChange,
}: {
  value: Environment;
  onChange: (env: Environment) => void;
}) {
  return (
    <div className="environment-options">
      {ENVIRONMENTS.map((env) => (
        <button
          type="button"
          key={env.id}
          className={value.id === env.id ? "selected" : ""}
          onClick={() => onChange({ ...env })}
        >
          <span className="option-check">
            {value.id === env.id && <Check size={12} />}
          </span>
          <strong>{env.name}</strong>
          <span>{env.subtitle}</span>
          <p>{env.description}</p>
        </button>
      ))}
    </div>
  );
}
export function ConfigDialog({
  initial,
  available,
  onCreate,
  onClose,
}: {
  initial?: PersonConfig;
  available: number;
  onCreate: (config: PersonConfig, count: number) => void;
  onClose: () => void;
}) {
  const [config, setConfig] = useState(initial ?? defaultConfig());
  const [mode, setMode] = useState<"random" | "target" | "manual">("target");
  const [target, setTarget] = useState<Mbti>(
    inferMbtiFromFunctions(config.scores).type ?? "INFP",
  );
  const [count, setCount] = useState(1);
  const inference = inferMbtiFromFunctions(config.scores);
  const change = <K extends keyof PersonConfig>(
    key: K,
    value: PersonConfig[K],
  ) => setConfig((previous) => ({ ...previous, [key]: value }));
  const roll = () => {
    const seed = `LIFE-${Date.now().toString(36).toUpperCase()}`;
    setConfig(randomConfig(seed));
    setMode("random");
  };
  return (
    <Modal
      title="为一段人生，写下起点"
      subtitle="不用选择梦想职业。人物会在经历中找到、改变或保留自己的方向。"
      onClose={onClose}
      wide
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          onCreate(
            {
              ...config,
              name: config.name.trim() || "未命名旅人",
              seed: config.seed.trim() || "LIFE-2026",
            },
            count,
          );
        }}
      >
        <div className="config-body">
          <div className="config-main">
            <div className="form-section-heading">
              <h3>
                01 <span>人物与起点</span>
              </h3>
              <button type="button" className="text-button" onClick={roll}>
                <Dices size={15} />
                随机生成
              </button>
            </div>
            <div className="form-grid">
              <label>
                姓名
                <input
                  value={config.name}
                  maxLength={12}
                  onChange={(event) => change("name", event.target.value)}
                  required
                />
              </label>
              <label>
                性别
                <select
                  value={config.gender}
                  onChange={(event) =>
                    change(
                      "gender",
                      event.target.value as PersonConfig["gender"],
                    )
                  }
                >
                  <option>女</option>
                  <option>男</option>
                  <option>非二元</option>
                </select>
              </label>
              <label>
                成长地区
                <select
                  value={config.region}
                  onChange={(event) =>
                    change(
                      "region",
                      event.target.value as PersonConfig["region"],
                    )
                  }
                >
                  <option>青屿市</option>
                  <option>临溪镇</option>
                  <option>远岚县</option>
                </select>
              </label>
              <label>
                家庭期待
                <select
                  value={config.expectation}
                  onChange={(event) =>
                    change(
                      "expectation",
                      event.target.value as PersonConfig["expectation"],
                    )
                  }
                >
                  <option>支持探索</option>
                  <option>重视学历</option>
                  <option>尽早稳定</option>
                </select>
              </label>
            </div>
            <label className="range-label">
              家庭资源 <span>{config.familyResources} / 100</span>
              <input
                type="range"
                min="0"
                max="100"
                value={config.familyResources}
                onChange={(event) =>
                  change("familyResources", Number(event.target.value))
                }
              />
              <small>
                通过材料、训练机会与试错缓冲参与经历，不直接修改八维或任务质量。
              </small>
            </label>
            <div className="form-section-heading">
              <h3>
                02 <span>认知画像</span>
              </h3>
            </div>
            <div className="segmented">
              {(
                [
                  { id: "target", name: "按类型采样" },
                  { id: "random", name: "随机八维" },
                  { id: "manual", name: "手动八维" },
                ] as const
              ).map((item) => (
                <button
                  type="button"
                  key={item.id}
                  className={mode === item.id ? "active" : ""}
                  onClick={() => {
                    setMode(item.id);
                    if (item.id === "random")
                      change(
                        "scores",
                        generateScores(`${config.seed}:${Date.now()}`),
                      );
                    if (item.id === "target")
                      change("scores", generateScores(config.seed, target));
                  }}
                >
                  {item.name}
                </button>
              ))}
            </div>
            {mode === "target" && (
              <label className="target-type">
                目标类型
                <select
                  value={target}
                  onChange={(event) => {
                    const type = event.target.value as Mbti;
                    setTarget(type);
                    change("scores", generateScores(config.seed, type));
                  }}
                >
                  {TYPES.map((type) => (
                    <option key={type}>{type}</option>
                  ))}
                </select>
                <small>采样相符的八维，显示标签仍由实际分数推导。</small>
              </label>
            )}
            {mode === "manual" && (
              <div className="score-sliders">
                {FUNCTIONS.map((key) => (
                  <label key={key}>
                    <span>
                      {key} <small>{FUNCTION_INFO[key].name}</small>
                    </span>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={config.scores[key]}
                      onChange={(event) =>
                        change("scores", {
                          ...config.scores,
                          [key]: Number(event.target.value),
                        })
                      }
                    />
                    <b>{config.scores[key]}</b>
                  </label>
                ))}
              </div>
            )}
            <p className="subtle-note">
              同类型也有不同分数组合；不设置八维总点数。
            </p>
          </div>
          <aside className="config-preview">
            <Sparkles size={20} />
            <span className="eyebrow">PERSONALITY PORTRAIT</span>
            <h3>{config.name || "新的人物"}</h3>
            <span className="type-badge">{inference.type ?? "类型待区分"}</span>
            <Radar scores={config.scores} />
            <p>
              人格是看世界的方式，
              <br />
              不是人生的标准答案。
            </p>
            <div>
              {FUNCTIONS.map((key) => (
                <span key={key}>
                  {key}
                  <b>{config.scores[key]}</b>
                </span>
              ))}
            </div>
          </aside>
        </div>
        <div className="config-environment">
          <div className="form-section-heading">
            <h3>
              03 <span>选择这段人生的土壤</span>
            </h3>
          </div>
          <EnvironmentOptions
            value={config.environment}
            onChange={(env) => change("environment", env)}
          />
          <details className="advanced-config">
            <summary>
              高级配置与复现条件 <ChevronDown size={14} />
            </summary>
            <div className="form-grid">
              <label>
                环境与人物种子
                <input
                  value={config.seed}
                  maxLength={64}
                  onChange={(event) => {
                    const seed = event.target.value;
                    setConfig((previous) => ({
                      ...previous,
                      seed,
                      scores:
                        mode === "manual"
                          ? previous.scores
                          : generateScores(
                              seed,
                              mode === "target" ? target : undefined,
                            ),
                    }));
                  }}
                />
              </label>
              <label>
                同时生成
                <select
                  value={count}
                  onChange={(event) => setCount(Number(event.target.value))}
                >
                  {[1, 4, 8, 16]
                    .filter((value) => value <= available)
                    .map((value) => (
                      <option value={value} key={value}>
                        {value} 名人物
                      </option>
                    ))}
                </select>
              </label>
            </div>
            <div className="env-sliders">
              {(
                [
                  { key: "learningAccess", label: "学习资源" },
                  { key: "exploration", label: "探索空间" },
                  { key: "standardWeight", label: "标准评价权重" },
                  { key: "credentialBias", label: "学校标签筛选" },
                  { key: "taskAlignment", label: "选拔与任务一致" },
                  { key: "dissentSupport", label: "异议支持" },
                  { key: "support", label: "培养支持" },
                  { key: "opportunity", label: "机会密度与竞争" },
                  { key: "genderBias", label: "性别偏见门槛" },
                  { key: "ageBias", label: "年龄偏见门槛" },
                  { key: "metricPressure", label: "短期指标压力" },
                ] as const
              ).map(({ key, label }) => (
                <label key={key}>
                  {label}
                  <span>{Math.round(config.environment[key] * 100)}</span>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={config.environment[key] * 100}
                    onChange={(event) =>
                      change("environment", {
                        ...config.environment,
                        [key]: Number(event.target.value) / 100,
                        name: `${ENVIRONMENTS.find((env) => env.id === config.environment.id)?.name ?? "当前环境"} · 自定义`,
                      })
                    }
                  />
                </label>
              ))}
            </div>
          </details>
        </div>
        <div className="modal-footer">
          <span>
            <Info size={14} />
            自动决策 · 无需 API Key · 可随时暂停
          </span>
          <button className="button button-primary" type="submit">
            <Plus size={16} />
            开始这段人生
          </button>
        </div>
      </form>
    </Modal>
  );
}
export function BranchDialog({
  run,
  month,
  onCreate,
  onClose,
}: {
  run: LifeRun;
  month: number;
  onCreate: (environment: Environment) => void;
  onClose: () => void;
}) {
  const [environment, setEnvironment] = useState(
    ENVIRONMENTS.find((env) => env.id !== run.environment.id) ??
      ENVIRONMENTS[0],
  );
  return (
    <Modal
      title="让人生，在这里分岔"
      subtitle={`从${run.character.name} ${monthLabel(month)}的真实快照出发，只改变之后的环境。`}
      onClose={onClose}
      wide
    >
      <div className="branch-body">
        <div className="branch-explanation">
          <GitBranch size={22} />
          <p>
            保留人物八维、已发生的经历、知识、作品、关系和可用资源。未来共用相同的外部随机键，人物会重新衡量选项，后续连锁反应可以不同。
          </p>
        </div>
        <EnvironmentOptions value={environment} onChange={setEnvironment} />
        <p className="subtle-note">
          当前环境：{run.environment.name}。分支从下一月生效，不会修改原人生。
        </p>
      </div>
      <div className="modal-footer">
        <span>原人生与分支可在“平行人生”中并排回放</span>
        <button
          className="button button-primary"
          onClick={() => onCreate(environment)}
        >
          <GitBranch size={16} />
          创建并对照
        </button>
      </div>
    </Modal>
  );
}
