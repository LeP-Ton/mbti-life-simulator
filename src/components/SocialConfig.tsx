import { useState } from "react";
import { ArrowRight, FlaskConical, Settings2 } from "lucide-react";
import { FUNCTIONS } from "../simulation/types";
import { generateScores } from "../simulation/personality";
import { defaultScenario, MODEL_NAMES } from "../social/config";
import type { PersonalityModel, ScenarioConfig } from "../social/types";

export function SocialConfig({
  initial,
  onStart,
  busy,
}: {
  initial: ScenarioConfig;
  onStart: (config: ScenarioConfig) => void;
  busy: boolean;
}) {
  const [config, setConfig] = useState(initial),
    [observers, setObservers] = useState(
      initial.trackedIds.map((id) => Number(id.slice(-5))).join(", "),
    );
  const [parameters, setParameters] = useState(
      JSON.stringify(initial.parameters, null, 2),
    ),
    [error, setError] = useState("");
  const [externalInputs, setExternalInputs] = useState(
    JSON.stringify(
      {
        macroSeries: initial.macroSeries ?? [],
        exogenousEvents: initial.exogenousEvents ?? [],
      },
      null,
      2,
    ),
  );
  const [custom, setCustom] = useState(!!initial.focal),
    [scores, setScores] = useState(
      initial.focal?.jung8 ?? generateScores(initial.seed),
    );
  const update = <K extends keyof ScenarioConfig>(
    key: K,
    value: ScenarioConfig[K],
  ) => setConfig((previous) => ({ ...previous, [key]: value }));
  const start = (small = false) => {
    try {
      const ids = [
        ...new Set(
          observers
            .split(/[,，\s]+/)
            .filter(Boolean)
            .map((value) => {
              if (!/^\d+$/.test(value))
                throw new Error("观察人物请填写数字编号，例如 0, 1, 2。");
              return `person-${String(Number(value)).padStart(5, "0")}`;
            }),
        ),
      ];
      if (ids.length < 1 || ids.length > 16)
        throw new Error("请选择一至十六名观察人物。");
      const scenarioInputs = JSON.parse(externalInputs);
      if (
        !scenarioInputs ||
        Object.keys(scenarioInputs).some(
          (k) => !["macroSeries", "exogenousEvents"].includes(k),
        )
      )
        throw new Error("外部情景仅接受 macroSeries 和 exogenousEvents。");
      const next = defaultScenario({
        ...config,
        ...(small ? { population: 80, months: 24 } : {}),
        parameters: JSON.parse(parameters),
        macroSeries: scenarioInputs.macroSeries ?? [],
        exogenousEvents: scenarioInputs.exogenousEvents ?? [],
        trackedIds: ids,
        focal: custom
          ? {
              jung8: scores,
              gender: initial.focal?.gender ?? "女",
              familyResources: initial.focal?.familyResources ?? 50,
              region: initial.focal?.region ?? "青屿市",
              profileOnly: !initial.focal || initial.focal.profileOnly === true,
            }
          : undefined,
      });
      if (ids.some((id) => Number(id.slice(-5)) >= next.population))
        throw new Error("观察编号必须小于初始人口。");
      onStart(next);
      setError("");
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error));
    }
  };
  return (
    <section className="sl-config sl-card">
      <div className="sl-section-title">
        <div>
          <span className="sl-kicker">WORLD SETUP / 01</span>
          <h2>给一千种人生，同一个起点</h2>
        </div>
        <Settings2 size={22} />
      </div>
      <p className="sl-muted">
        人物共享有限的岗位、名额和家庭资源。十五岁的观察人物加入一个已经有不同年龄成员的社会。
      </p>
      <div className="sl-form-grid">
        <label>
          观察人物姓名
          <input
            value={config.focalName}
            maxLength={24}
            onChange={(e) => update("focalName", e.target.value)}
          />
        </label>
        <label>
          世界种子
          <input
            value={config.seed}
            maxLength={100}
            onChange={(e) => update("seed", e.target.value)}
          />
        </label>
        <label>
          初始人口
          <input
            type="number"
            min="3"
            max="10000"
            value={config.population}
            onChange={(e) => update("population", Number(e.target.value))}
          />
        </label>
        <label>
          观察月数
          <input
            type="number"
            min="1"
            max="1200"
            value={config.months}
            onChange={(e) => update("months", Number(e.target.value))}
          />
        </label>
        <label>
          人格模型
          <select
            value={config.model}
            onChange={(e) =>
              update("model", e.target.value as PersonalityModel)
            }
          >
            {Object.entries(MODEL_NAMES).map(([key, name]) => (
              <option key={key} value={key}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <label>
          观察人物编号
          <input
            value={observers}
            onChange={(e) => setObservers(e.target.value)}
            placeholder="0, 1, 2"
          />
          <small>初始编号 0 起，最多十六人保存密集轨迹。</small>
        </label>
      </div>
      <details className="sl-details">
        <summary>观察人物基础画像</summary>
        <label className="sl-check">
          <input
            type="checkbox"
            checked={custom}
            onChange={(e) => setCustom(e.target.checked)}
          />
          自定义八维初始分数
        </label>
        <p className="sl-muted">
          八维和大五分别采样。修改八维只作用于八维模型的行动偏好；无人格版本中不产生人格效应。
        </p>
        {custom && (
          <div className="sl-score-inputs">
            {FUNCTIONS.map((k) => (
              <label key={k}>
                {k}
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={scores[k]}
                  onChange={(e) =>
                    setScores({ ...scores, [k]: Number(e.target.value) })
                  }
                />
              </label>
            ))}
          </div>
        )}
      </details>
      <details className="sl-details">
        <summary>外部情景 · 宏观输入与人口冲击</summary>
        <p className="sl-muted">
          按月份预登记需求、物价、外部拨款和指定人口冲击。人物不能读取尚未发生的事件。未指定时使用合成外生统计过程。
        </p>
        <textarea
          aria-label="外部情景 JSON"
          className="sl-code-input"
          rows={8}
          value={externalInputs}
          onChange={(e) => setExternalInputs(e.target.value)}
          spellCheck={false}
        />
      </details>
      <details className="sl-details">
        <summary>实验参数 · 全部未标定</summary>
        <p className="sl-muted">
          可独立开关信念、习惯、机构学习和人格可塑性。金额使用整数分，技能使用
          0—1；未提供的字段不会自动视为零。
        </p>
        <textarea
          aria-label="参数 JSON"
          className="sl-code-input"
          rows={15}
          value={parameters}
          spellCheck={false}
          onChange={(e) => setParameters(e.target.value)}
        />
      </details>
      {error && (
        <p className="sl-error" role="alert">
          {error}
        </p>
      )}
      <div className="sl-actions">
        <button className="sl-primary" disabled={busy} onClick={() => start()}>
          <ArrowRight size={17} />
          创建并模拟社会
        </button>
        <button
          className="sl-secondary"
          disabled={busy}
          onClick={() => start(true)}
        >
          <FlaskConical size={16} />
          先运行 80 人 · 24 月
        </button>
      </div>
      <p className="sl-footnote">
        完整人生默认为 540
        个月。计算在本地后台线程进行，可取消；播放和回看不会重新抽取结果。
      </p>
    </section>
  );
}
