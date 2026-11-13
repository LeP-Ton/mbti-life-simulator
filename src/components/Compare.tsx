import {
  ArrowLeftRight,
  ArrowUpRight,
  GitBranch,
  Plus,
  Shuffle,
  Users,
} from "lucide-react";
import {
  DOMAIN_NAMES,
  monthLabel,
  moneyLabel,
  STAGE_NAMES,
  TOTAL_MONTHS,
} from "../simulation/config";
import { findDivergence } from "../simulation/engine";
import type { LifeRun } from "../simulation/types";
import { Avatar } from "./Visuals";

export type ComparisonKind = "environment" | "type" | "origin" | "seed";
export function Compare({
  runs,
  selected,
  otherId,
  cursor,
  onOther,
  onCreate,
  onJump,
}: {
  runs: LifeRun[];
  selected: LifeRun;
  otherId: string;
  cursor: number;
  onOther: (id: string) => void;
  onCreate: (kind: ComparisonKind) => void;
  onJump: (month: number) => void;
}) {
  const other =
    runs.find((run) => run.id === otherId && run.id !== selected.id) ??
    runs.find((run) => run.id !== selected.id);
  const divergence = other ? findDivergence(selected, other) : null;
  const held = other
    ? [
        JSON.stringify(selected.character.scores) ===
          JSON.stringify(other.character.scores) && "基础八维",
        selected.character.seed === other.character.seed && "外部随机种子",
        selected.character.familyResources ===
          other.character.familyResources && "家庭资源",
        selected.character.gender === other.character.gender && "性别身份",
      ].filter(Boolean)
    : [];
  return (
    <div className="compare-view">
      <section className="panel">
        <div className="section-heading">
          <div>
            <span className="eyebrow">SAME PERSON, ANOTHER POSSIBILITY</span>
            <h2>
              如果，换一种土壤<span className="heading-dot">.</span>
            </h2>
          </div>
          <ArrowLeftRight size={23} />
        </div>
        <p className="section-description">
          把“人格如此”拆开来看。哪些条件保持不变？什么让选择在某个月开始分岔？
        </p>
        <div className="comparison-actions">
          {(
            [
              {
                kind: "environment",
                title: "同人换环境",
                sub: "从当前快照出发",
                icon: GitBranch,
              },
              {
                kind: "type",
                title: "同起点换类型",
                sub: "保留身份与外部种子",
                icon: ArrowLeftRight,
              },
              {
                kind: "origin",
                title: "同类型换起点",
                sub: "比较家庭与成长条件",
                icon: Users,
              },
              {
                kind: "seed",
                title: "同配置换种子",
                sub: "观察另一组外部机遇",
                icon: Shuffle,
              },
            ] as const
          ).map(({ kind, title, sub, icon: Icon }) => (
            <button
              key={kind}
              onClick={() => onCreate(kind)}
              disabled={
                runs.length >= 16 ||
                (kind === "environment" && cursor >= TOTAL_MONTHS)
              }
            >
              <Icon size={19} />
              <strong>{title}</strong>
              <span>{sub}</span>
              <Plus size={14} />
            </button>
          ))}
        </div>
      </section>
      {other ? (
        <>
          <section className="divergence-note">
            <GitBranch size={21} />
            <div>
              <strong>
                {divergence === null
                  ? "截至观察终点，两条轨迹没有可辨认的行为与积累差异"
                  : `轨迹从 ${monthLabel(divergence)} 开始出现可辨认的差异`}
              </strong>
              <p>
                保持一致：{held.length ? held.join("、") : "月度时钟与模拟规则"}
                。
                {other.branch?.parentId === selected.id
                  ? `分支复制了${monthLabel(other.branch.month)}的完整状态，之后改变环境。`
                  : "以下并排展示同一观察月份的真实记录。"}
              </p>
            </div>
            {divergence !== null && (
              <button
                className="text-button"
                onClick={() => onJump(divergence)}
              >
                定位分化点 <ArrowUpRight size={14} />
              </button>
            )}
          </section>
          <div className="compare-columns">
            {[selected, other].map((run, index) => {
              const state = run.snapshots[cursor];
              const recent = run.events
                .filter((event) => event.month <= cursor && event.important)
                .slice(-3)
                .reverse();
              return (
                <section className="panel compare-life" key={run.id}>
                  <div className="compare-person">
                    <Avatar character={run.character} small />
                    <div>
                      <strong>
                        {run.character.name}{" "}
                        <span className="type-badge">
                          {run.character.inference.type ?? "待区分"}
                        </span>
                      </strong>
                      {index === 1 ? (
                        <select
                          aria-label="选择对照人物"
                          value={other.id}
                          onChange={(event) => onOther(event.target.value)}
                        >
                          {runs
                            .filter((item) => item.id !== selected.id)
                            .map((item) => (
                              <option key={item.id} value={item.id}>
                                {item.name}
                              </option>
                            ))}
                        </select>
                      ) : (
                        <span>{run.name}</span>
                      )}
                    </div>
                    <span className="outline-badge">
                      {index === 0 ? "当前人生" : "对照人生"}
                    </span>
                  </div>
                  <div className="compare-environment">
                    <span>{run.environment.name}</span>
                    <p>{run.environment.description}</p>
                    {run.branch && (
                      <small>
                        此环境从{monthLabel(run.branch.month + 1)}
                        起生效，之前保留原快照。
                      </small>
                    )}
                    <small>
                      家庭资源 {run.character.familyResources} ·{" "}
                      {run.character.expectation} · 种子 {run.character.seed}
                    </small>
                  </div>
                  <div className="compare-current">
                    <span>
                      {monthLabel(cursor)} · {STAGE_NAMES[state.stage]}
                    </span>
                    <h3>{state.job?.role ?? state.education.institution}</h3>
                    <p>当前策略：{state.lastAction}</p>
                  </div>
                  <dl className="compare-metrics">
                    <div>
                      <dt>学习投入</dt>
                      <dd>{state.development.studyHours.toLocaleString()}h</dd>
                    </div>
                    <div>
                      <dt>作品积累</dt>
                      <dd>{state.development.works.length} 份</dd>
                    </div>
                    <div>
                      <dt>可用储备</dt>
                      <dd>{moneyLabel(state.dynamic.money)}</dd>
                    </div>
                    <div>
                      <dt>自主 / 满意度</dt>
                      <dd>
                        {Math.round(state.dynamic.autonomy)} /{" "}
                        {Math.round(state.dynamic.satisfaction)}
                      </dd>
                    </div>
                    <div>
                      <dt>当前兴趣</dt>
                      <dd>{DOMAIN_NAMES[state.focus]}</dd>
                    </div>
                    <div>
                      <dt>预筛选关闭</dt>
                      <dd>{state.blockedCount} 次</dd>
                    </div>
                  </dl>
                  <h4 className="subheading">分化背后的近期节点</h4>
                  {recent.map((event) => (
                    <button
                      className="compare-event"
                      key={event.id}
                      onClick={() => onJump(event.month)}
                    >
                      <small>{monthLabel(event.month)}</small>
                      <strong>{event.title}</strong>
                      <p>{event.evaluation}</p>
                    </button>
                  ))}
                  {!recent.length && (
                    <p className="empty-copy">
                      继续播放，重要节点会在这里逐步出现。
                    </p>
                  )}
                </section>
              );
            })}
          </div>
        </>
      ) : (
        <section className="panel empty-state compare-empty">
          <GitBranch size={40} />
          <h3>同一种人格，也可以长出不同的人生</h3>
          <p>创建一个对照，保留不变的条件，看看环境和起点如何留下痕迹。</p>
          <button
            className="button button-primary"
            onClick={() => onCreate("environment")}
          >
            <GitBranch size={16} />
            创建环境分支
          </button>
        </section>
      )}
    </div>
  );
}
