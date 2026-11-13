import { ChevronDown, GitBranch, Leaf, MapPin, Sparkles } from "lucide-react";
import { DOMAIN_NAMES, monthLabel, STAGE_NAMES } from "../simulation/config";
import { environmentAt } from "../simulation/engine";
import { FUNCTION_INFO, TYPE_STACKS } from "../simulation/personality";
import {
  DOMAINS,
  FUNCTIONS,
  type LifeRun,
  type LifeState,
} from "../simulation/types";
import { Avatar, Radar } from "./Visuals";

export function PersonCard({
  run,
  state,
  onBranch,
}: {
  run: LifeRun;
  state: LifeState;
  onBranch: () => void;
}) {
  const character = run.character,
    inference = character.inference;
  const environment = environmentAt(run, state.month);
  const interests = [...DOMAINS]
    .sort((a, b) => state.dynamic.interests[b] - state.dynamic.interests[a])
    .slice(0, 2);
  return (
    <aside className="person-column">
      <section className="panel person-card">
        <div className="panel-eyebrow">
          <span>正在观察的人生</span>
          <span className="live-dot" />
        </div>
        <div className="person-identity">
          <Avatar character={character} />
          <h2>{character.name}</h2>
          <p>
            {monthLabel(state.month)}
            <span>·</span>
            {character.gender}
          </p>
          <span className="type-badge">
            {inference.type ?? "类型待区分"}
            <Sparkles size={12} />
          </span>
        </div>
        <div className="stage-pill">
          <Leaf size={13} />
          {STAGE_NAMES[state.stage]}
        </div>
        <div className="person-location">
          <MapPin size={12} />
          {character.region}
          <span>·</span>
          {state.job?.organization ?? state.education.institution}
        </div>
        <div className="divider" />
        <div className="card-label">
          <span>荣格八维画像</span>
          <span className="muted">0—100</span>
        </div>
        <Radar scores={character.scores} />
        <div className="function-grid">
          {FUNCTIONS.map((key) => (
            <div key={key} title={FUNCTION_INFO[key].brief}>
              <span>{key}</span>
              <b>{character.scores[key]}</b>
              <i style={{ width: `${character.scores[key]}%` }} />
            </div>
          ))}
        </div>
        <details className="type-details">
          <summary>
            了解这份画像 <ChevronDown size={13} />
          </summary>
          <p>
            基础八维是稳定的游戏内部指数。经验、年龄和岗位不会给它自动加点。
          </p>
          {inference.type && (
            <p>
              参考序列：{TYPE_STACKS[inference.type].join(" → ")}
              。实际分数排序：{inference.ranking.join(" / ")}。
            </p>
          )}
          <p>
            {inference.tied
              ? "存在并列匹配，按固定顺序显示。"
              : inference.close
                ? `接近 ${inference.alternatives[1]?.type}，当前类型区分较弱。`
                : "当前向量与主类型模板的差异较清晰。"}{" "}
            前两名相似度差：{inference.distinction.toFixed(3)}
            ，并非心理判断准确率。
          </p>
          <p>算法：{inference.algorithmVersion}</p>
        </details>
        <div className="divider" />
        <div className="card-label">
          <span>此刻的兴趣</span>
          <span className="muted">会随经历变化</span>
        </div>
        <div className="interest-tags">
          {interests.map((domain) => (
            <span key={domain}>{DOMAIN_NAMES[domain]}</span>
          ))}
        </div>
        <p className="current-thought">“{state.lastAction}”</p>
        <div className="state-bars">
          {(
            [
              ["精力", state.dynamic.energy, "#819665"],
              ["压力", state.dynamic.stress, "#bf9672"],
              ["表达意愿", state.dynamic.voice, "#82a2a2"],
            ] as const
          ).map(([label, value, color]) => (
            <div key={label}>
              <span>{label}</span>
              <i>
                <b style={{ width: `${value}%`, background: color }} />
              </i>
              <em>{Math.round(value)}</em>
            </div>
          ))}
        </div>
      </section>
      <section className="panel environment-card">
        <div className="card-label">
          <span>这段人生的土壤</span>
          <GitBranch size={16} />
        </div>
        <h3>{environment.name}</h3>
        <p>
          {environment.subtitle} · {run.character.expectation}
        </p>
        <div className="environment-mini">
          <span>
            探索空间<b>{Math.round(environment.exploration * 100)}</b>
          </span>
          <span>
            培养支持<b>{Math.round(environment.support * 100)}</b>
          </span>
        </div>
        <button
          className="text-button"
          onClick={onBranch}
          disabled={state.month >= 540}
        >
          换个环境，看看另一种可能 <span>↗</span>
        </button>
      </section>
    </aside>
  );
}
