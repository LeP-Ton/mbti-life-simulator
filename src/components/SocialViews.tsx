import { useMemo, useState } from "react";
import {
  ArrowDownRight,
  ArrowUpRight,
  BookOpen,
  Brain,
  BriefcaseBusiness,
  ChevronDown,
  GitBranch,
  Heart,
  MessageSquare,
  Network,
  Wallet,
} from "lucide-react";
import { DOMAINS, FUNCTIONS } from "../simulation/types";
import { DOMAIN_NAMES } from "../simulation/config";
import { inferMbtiFromFunctions } from "../simulation/personality";
import {
  ACTION_NAMES,
  MODEL_NAMES,
  NEED_NAMES,
  parameterBundle,
} from "../social/config";
import { betaMean } from "../social/math";
import { projectLife } from "../social/run";
import type {
  ActionKind,
  Metrics,
  PersonFrame,
  WorldEvent,
  WorldRun,
} from "../social/types";

export const money = (fen: number) =>
  new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 0 }).format(
    fen / 100,
  );
export const percent = (n: number) => `${(n * 100).toFixed(1)}%`;
export const elapsed = (month: number) =>
  `${Math.floor(month / 12)} 年 ${month % 12} 月`;
const EMOTION_NAMES: Record<string, string> = {
  joy: "喜悦",
  distress: "难过",
  fear: "担忧",
  anger: "愤怒",
  gratitude: "感激",
  pride: "自豪",
  shame: "羞愧",
};
const HOURS: Record<string, string> = {
  course: "课程",
  work: "工作",
  study: "自学",
  practice: "实践",
  search: "求职",
  connection: "关系",
  rest: "恢复",
  care: "照料",
};

export function Trend({
  values,
  color = "#416b58",
  label,
}: {
  values: number[];
  color?: string;
  label: string;
}) {
  const max = Math.max(1, ...values),
    min = Math.min(0, ...values),
    range = max - min || 1;
  const points = values
    .map(
      (v, i) =>
        `${(i / Math.max(1, values.length - 1)) * 600},${92 - ((v - min) / range) * 80}`,
    )
    .join(" ");
  return (
    <svg
      className="sl-trend"
      viewBox="0 0 600 100"
      role="img"
      aria-label={label}
      preserveAspectRatio="none"
    >
      <path
        d="M0 92H600 M0 52H600 M0 12H600"
        stroke="#dce3d8"
        strokeDasharray="3 5"
      />
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="2.5"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
export function MetricStrip({ metric }: { metric: Metrics }) {
  return (
    <div className="sl-metrics">
      {[
        {
          label: "共同生活的人",
          value: metric.alive.toLocaleString(),
          unit: "人",
          note: `累计出生与死亡均进入世界`,
        },
        {
          label: "实际就业比例",
          value: (metric.employmentRate * 100).toFixed(1),
          unit: "%",
          note: `${metric.employed} / ${metric.eligibleWorkers} 名可就业成人`,
        },
        {
          label: "月收入中位数",
          value: money(metric.incomeP50),
          unit: "元",
          note: "全部在世人物 · 税后实际到账",
        },
        {
          label: "生活消费缺口",
          value: money(metric.consumptionGap),
          unit: "元",
          note: `${metric.activeFirms} 家企业持续经营`,
        },
      ].map((m) => (
        <article key={m.label}>
          <span>{m.label}</span>
          <strong>
            {m.value}
            <small>{m.unit}</small>
          </strong>
          <p>{m.note}</p>
        </article>
      ))}
    </div>
  );
}
export function PersonOverview({
  frame,
  run,
}: {
  frame: PersonFrame;
  run: WorldRun;
}) {
  const p = frame.person,
    age = ((p.diedMonth ?? frame.month) - p.birthMonth) / 12,
    type = inferMbtiFromFunctions(p.profiles.effectiveJung8).type;
  return (
    <aside className="sl-person sl-card">
      <div className="sl-person-top">
        <div className="sl-person-avatar">
          {p.name.slice(0, 1)}
          <span>{Math.floor(age)}</span>
        </div>
        <div>
          <span className="sl-kicker">PERSON / {p.id.slice(-5)}</span>
          <h2>{p.name}</h2>
          <p>
            {p.alive
              ? `${age.toFixed(1)} 岁 · ${p.regionId}`
              : "观察人物已离世"}
          </p>
        </div>
      </div>
      <div className="sl-type">
        <Brain size={15} />
        <strong>
          {run.config.model === "jung8"
            ? (type ?? "画像接近")
            : MODEL_NAMES[run.config.model]}
        </strong>
        <span>基础画像 v{p.profiles.version}</span>
      </div>
      <p className="sl-person-note">
        {!p.alive
          ? "生命历程已停止，社会继续运行"
          : frame.firmName
            ? `${frame.firmName} · ${["初级岗位", "熟练岗位", "负责人岗位"][frame.jobGrade ?? 0]}`
            : p.education.schoolId
              ? "正在接受机构培养"
              : p.education.path === "school"
                ? "基础学习阶段"
                : "当前未任职"}
      </p>
      <div className="sl-person-money">
        <Wallet size={17} />
        <span>
          个人现金<strong>¥ {money(frame.cash)}</strong>
        </span>
        <span>
          家庭公共账户<strong>¥ {money(frame.householdCash)}</strong>
        </span>
      </div>
      <div className="sl-bars">
        {[
          ["健康", p.state.health],
          ["精力", p.state.energy],
          ["压力", p.state.stress],
        ].map(([name, value]) => (
          <div key={String(name)}>
            <label>
              {name}
              <b>{percent(Number(value))}</b>
            </label>
            <span>
              <i style={{ width: `${Number(value) * 100}%` }} />
            </span>
          </div>
        ))}
      </div>
      <details className="sl-details">
        <summary>查看独立采样的两套画像</summary>
        {[
          ["八维", p.profiles.effectiveJung8],
          ["大五", p.profiles.effectiveBig5],
        ].map(([label, scores]) => (
          <div key={String(label)} className="sl-profile">
            <h4>{String(label)}</h4>
            {Object.entries(scores).map(([key, value]) => (
              <span key={key}>
                {key}
                <b>
                  {label === "大五"
                    ? percent(Number(value))
                    : Number(value).toFixed(1)}
                </b>
              </span>
            ))}
          </div>
        ))}
        <p className="sl-footnote">
          画像影响偏好；实际任务质量由知识、实践、精力和投入时间计算。
        </p>
      </details>
      <div className="sl-need-list">
        <h4>这个人重视什么</h4>
        {Object.entries(p.motives)
          .sort((a, b) => b[1] - a[1])
          .map(([key, value]) => (
            <div key={key}>
              <span>{NEED_NAMES[key as keyof typeof NEED_NAMES]}</span>
              <b>{percent(value)}</b>
            </div>
          ))}
      </div>
      <div className="sl-person-bottom">
        <Network size={15} />
        <span>人物只按已获得的信息决策。研究者视图可查看事实。</span>
      </div>
    </aside>
  );
}

function eventDescription(event: WorldEvent, personId: string) {
  const o = event.observations[personId] ?? {};
  if (event.kind === "task-result")
    return `实际生产投入 ${event.hours} h，质量 ${percent(Number(o.quality))}，本次要求 ${percent(Number(o.difficulty))}；${o.success ? "达到要求" : "未达到要求"}，预期通过概率 ${percent(Number(o.pSuccess))}。`;
  if (event.kind === "action")
    return `选择「${ACTION_NAMES[o.action as ActionKind] ?? o.action}」；课程 ${o.courseHours ?? 0} h、工作 ${o.workHours ?? 0} h、自学 ${o.studyHours ?? 0} h、实践 ${o.practiceHours ?? 0} h、恢复 ${o.restHours ?? 0} h。`;
  if (event.kind === "expression")
    return `${o.channel === "public" ? "公开提出" : "私下沟通"}，证据自信 ${percent(Number(o.confidence))}。${o.punished ? "随后承担了额外无偿工作。" : "这次没有受到处罚。"}${o.investigated ? "组织安排了核实与修正。" : "问题暂未得到组织处理。"}`;
  if (event.kind === "payment")
    return `实际到账 ¥${money(Number(o.received))}，累计工资债权 ¥${money(Number(o.arrears))}。`;
  if (event.kind === "collaboration")
    return `合作质量 ${percent(Number(o.quality))}，${o.fulfilled ? "交付完成" : "交付未完成"}；移除自身后的质量差 ${Number(o.contribution).toFixed(3)}，外界记功份额 ${percent(Number(o.externalCredit))}。`;
  return (
    Object.entries(o)
      .filter(([k]) => k !== "candidates")
      .map(
        ([k, v]) =>
          `${FIELD_NAMES[k] ?? k}：${typeof v === "boolean" ? (v ? "是" : "否") : String(v)}`,
      )
      .join("；") || "此事件只有研究者能够获知的结果。"
  );
}
const FIELD_NAMES: Record<string, string> = {
  confidence: "证据自信",
  verified: "核实得到结果",
  firmId: "机构",
  schoolId: "培养机构",
  wage: "月工资（分）",
  grade: "岗位等级",
  positionId: "岗位",
  health: "健康",
  householdId: "家庭",
  quality: "质量",
  productiveHours: "有效生产工时",
  ended: "行动终止",
  born: "新成员",
  accepted: "接受邀请",
  source: "信息来源",
};
export function SocialTimeline({
  run,
  personId,
  cursor,
}: {
  run: WorldRun;
  personId: string;
  cursor: number;
}) {
  const [researcher, setResearcher] = useState(false),
    [filter, setFilter] = useState("all"),
    [limit, setLimit] = useState(24);
  const view = useMemo(
    () => projectLife(run, personId, cursor),
    [run, personId, cursor],
  );
  const events = view.events.filter(
    (e) =>
      (researcher || !!e.observations[personId]) &&
      (filter === "all" ||
        (filter === "interaction" &&
          [
            "expression",
            "collaboration",
            "invitation",
            "verification",
            "vacancy-information",
          ].includes(e.kind)) ||
        (filter === "milestone" &&
          !["action", "payment", "invitation", "vacancy-information"].includes(
            e.kind,
          ))),
  );
  return (
    <section className="sl-card sl-timeline">
      <div className="sl-section-title">
        <div>
          <span className="sl-kicker">OBSERVED LIFE</span>
          <h2>选择发生在具体的处境里</h2>
        </div>
        <BookOpen size={21} />
      </div>
      <div className="sl-filter-row">
        <div role="group" aria-label="事件筛选">
          {[
            ["all", "全部经历"],
            ["interaction", "互动与回应"],
            ["milestone", "转折与交付"],
          ].map(([id, label]) => (
            <button
              key={id}
              className={filter === id ? "active" : ""}
              onClick={() => {
                setFilter(id);
                setLimit(24);
              }}
            >
              {label}
            </button>
          ))}
        </div>
        <label className="sl-check">
          <input
            type="checkbox"
            checked={researcher}
            onChange={(e) => setResearcher(e.target.checked)}
          />
          研究者事实
        </label>
      </div>
      {!events.length ? (
        <div className="sl-empty">
          <BookOpen size={32} />
          <h3>
            {cursor === 0 ? "故事从下一次选择开始" : "这个筛选范围内还没有事件"}
          </h3>
          <p>播放时间或移动月份游标，查看已经计算完成的经历。</p>
        </div>
      ) : (
        <div className="sl-event-list">
          {events
            .slice(-limit)
            .reverse()
            .map((e) => {
              const own = e.observations[personId],
                action = own?.action as ActionKind;
              return (
                <article className={`sl-event sl-event-${e.kind}`} key={e.id}>
                  <div className="sl-event-icon">
                    {e.kind === "expression" ? (
                      <MessageSquare size={16} />
                    ) : e.kind === "payment" ? (
                      <Wallet size={16} />
                    ) : e.kind === "collaboration" ? (
                      <Network size={16} />
                    ) : (
                      <BookOpen size={16} />
                    )}
                  </div>
                  <div className="sl-event-main">
                    <div className="sl-event-meta">
                      <span>
                        第 {e.month} 月 · 子步 {e.substep + 1}
                      </span>
                      <span>
                        {e.kind === "action"
                          ? `选择概率 ${percent(Number(own?.probability))}`
                          : e.ruleId.split("/").at(-1)}
                      </span>
                    </div>
                    <h3>
                      {e.kind === "action" ? ACTION_NAMES[action] : e.title}
                    </h3>
                    <p>{eventDescription(e, personId)}</p>
                    <details>
                      <summary>
                        查看决策与因果证据 <ChevronDown size={13} />
                      </summary>
                      <dl>
                        <dt>事件</dt>
                        <dd>{e.id}</dd>
                        <dt>原因事件</dt>
                        <dd>{e.causeIds.join("、") || "本期新发生"}</dd>
                        <dt>实际占用</dt>
                        <dd>
                          {e.hours} 小时 · ¥{money(e.money)}
                        </dd>
                      </dl>
                      {typeof own?.candidates === "string" && (
                        <div className="sl-table-wrap">
                          <table>
                            <thead>
                              <tr>
                                <th>可行候选</th>
                                <th>两步估值</th>
                                <th>选择概率</th>
                              </tr>
                            </thead>
                            <tbody>
                              {(
                                JSON.parse(own.candidates) as {
                                  action: ActionKind;
                                  value: number;
                                  probability: number;
                                }[]
                              ).map((c) => (
                                <tr key={c.action}>
                                  <td>{ACTION_NAMES[c.action]}</td>
                                  <td>{c.value.toFixed(3)}</td>
                                  <td>{percent(c.probability)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                      {researcher && (
                        <pre>{JSON.stringify(e.truth, null, 2)}</pre>
                      )}
                    </details>
                  </div>
                </article>
              );
            })}
        </div>
      )}
      {events.length > limit && (
        <button
          className="sl-secondary sl-load-more"
          onClick={() => setLimit(limit + 30)}
        >
          再看更早的三十条经历
        </button>
      )}
    </section>
  );
}

export function SocialArchive({
  run,
  frame,
}: {
  run: WorldRun;
  frame: PersonFrame;
}) {
  const p = frame.person;
  const beliefs = Object.entries(p.beliefs).sort(([a], [b]) =>
    a.localeCompare(b),
  );
  return (
    <div className="sl-stack">
      <section className="sl-card">
        <div className="sl-section-title">
          <div>
            <span className="sl-kicker">DEVELOPMENT</span>
            <h2>积累与画像分别记录</h2>
          </div>
          <BriefcaseBusiness size={22} />
        </div>
        <div className="sl-three-stats">
          {[
            [p.memory.totalStudyHours, "累计学习 · h"],
            [p.memory.totalPracticeHours, "自主实践 · h"],
            [p.memory.totalWorkHours, "实际工作 · h"],
          ].map(([v, label]) => (
            <div key={String(label)}>
              <strong>{Number(v).toLocaleString()}</strong>
              <small>{label}</small>
            </div>
          ))}
        </div>
        <div className="sl-skill-list">
          {DOMAINS.map((d) => (
            <div key={d}>
              <h4>{DOMAIN_NAMES[d]}</h4>
              <label>
                <span>知识 {percent(p.development.knowledge[d])}</span>
                <i>
                  <b
                    style={{ width: `${p.development.knowledge[d] * 100}%` }}
                  />
                </i>
              </label>
              <label>
                <span>实践 {percent(p.development.practice[d])}</span>
                <i>
                  <b style={{ width: `${p.development.practice[d] * 100}%` }} />
                </i>
              </label>
            </div>
          ))}
        </div>
      </section>
      <section className="sl-card">
        <div className="sl-section-title">
          <div>
            <span className="sl-kicker">BELIEF / EVIDENCE</span>
            <h2>相信的规则，和发生的回应</h2>
          </div>
          <Brain size={22} />
        </div>
        <p className="sl-muted">
          不同机构、表达渠道和证据自信分别保存。Beta
          的均值是人物主观预期；每次真实处罚概率还取决于主管判断与表达方式。
        </p>
        {!beliefs.length ? (
          <p className="sl-muted">
            尚无可更新的反馈，使用 Beta(2,2) 先验，或信念学习已关闭。
          </p>
        ) : (
          <div className="sl-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>对象与情境</th>
                  <th>α / β</th>
                  <th>主观概率</th>
                  <th>最近反馈的真实条件概率</th>
                </tr>
              </thead>
              <tbody>
                {beliefs.map(([key, belief]) => {
                  const events = run.events.filter(
                      (e) =>
                        e.month <= frame.month &&
                        e.kind === "expression" &&
                        e.actorIds.includes(p.id) &&
                        key ===
                          `${e.truth.firmId}/${e.observations[p.id]?.channel}/${Number(e.observations[p.id]?.confidence) >= 0.7 ? "high" : "low"}/punish`,
                    ),
                    last = events.at(-1);
                  return (
                    <tr key={key}>
                      <td>{key}</td>
                      <td>
                        {belief.alpha.toFixed(2)} / {belief.beta.toFixed(2)}
                      </td>
                      <td>{percent(betaMean(belief))}</td>
                      <td>
                        {last ? percent(Number(last.truth.pPunish)) : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <section className="sl-card">
        <div className="sl-section-title">
          <div>
            <span className="sl-kicker">WORK / ADAPTATION</span>
            <h2>经验如何留下痕迹</h2>
          </div>
          <Heart size={21} />
        </div>
        <div className="sl-emotions">
          {Object.entries(p.state.emotions).map(([k, v]) => (
            <div key={k}>
              <span>{EMOTION_NAMES[k]}</span>
              <b>{percent(v)}</b>
            </div>
          ))}
        </div>
        <h3>近期作品与合作</h3>
        <p className="sl-muted">
          累计 {p.memory.totalWorks}{" "}
          项，保留最近二十四项。合作贡献可为负；外界记功单独记录。
        </p>
        <div className="sl-table-wrap">
          <table>
            <thead>
              <tr>
                <th>月份</th>
                <th>领域</th>
                <th>质量</th>
                <th>操作性贡献</th>
                <th>外界记功</th>
              </tr>
            </thead>
            <tbody>
              {p.development.works
                .slice()
                .reverse()
                .map((w) => (
                  <tr key={w.id}>
                    <td>{w.month}</td>
                    <td>{DOMAIN_NAMES[w.domain]}</td>
                    <td>{percent(w.quality)}</td>
                    <td>{w.contribution.toFixed(3)}</td>
                    <td>
                      {w.externalCredit === undefined
                        ? "—"
                        : percent(w.externalCredit)}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
        <h3>长期更新记录</h3>
        {p.memory.revisions.length ? (
          p.memory.revisions.map((r) => (
            <details className="sl-details" key={r.id}>
              <summary>
                第 {r.month} 月 · {r.layer} · {r.status}
              </summary>
              <p>{r.reason}</p>
              <p>
                支持证据 {r.evidenceIds.length} 条；版本 {r.baseVersion}。
              </p>
            </details>
          ))
        ) : (
          <p className="sl-muted">
            基础人格未更新。习惯按季度汇总，人格可塑性默认关闭。
          </p>
        )}
      </section>
    </div>
  );
}

export function SocialAccounts({
  run,
  cursor,
  personId,
}: {
  run: WorldRun;
  cursor: number;
  personId: string;
}) {
  const metric = run.metrics[cursor],
    frame = projectLife(run, personId, cursor).frame;
  const rows = run.ledger
    .filter(
      (l) =>
        l.month <= cursor &&
        (l.from === frame?.person.cashAccountId ||
          l.to === frame?.person.cashAccountId ||
          l.from === `account:${frame?.person.householdId}` ||
          l.to === `account:${frame?.person.householdId}`),
    )
    .slice(-80)
    .reverse();
  return (
    <div className="sl-stack">
      <section className="sl-card">
        <div className="sl-section-title">
          <div>
            <span className="sl-kicker">SOCIAL ACCOUNTS</span>
            <h2>每一笔资源，都有去处</h2>
          </div>
          <Wallet size={22} />
        </div>
        <div className="sl-three-stats">
          <div>
            <strong>¥{money(metric.totalCash)}</strong>
            <small>社会内部现金</small>
          </div>
          <div>
            <strong>¥{money(metric.externalNet)}</strong>
            <small>累计外部净流入</small>
          </div>
          <div>
            <strong>{metric.accountingError} 分</strong>
            <small>现金恒等式误差</small>
          </div>
        </div>
        <Trend
          values={run.metrics
            .filter((m) => m.month <= cursor)
            .map((m) => m.employmentRate * 100)}
          label="实际就业比例随时间的变化"
        />
        <div className="sl-chart-caption">
          <span>世界起点</span>
          <span>就业比例 · 截至第 {cursor} 月</span>
        </div>
        <p className="sl-footnote">
          内部转账不改变社会现金。外部订单增加现金，消费、材料与运营支出减少现金；欠薪保留在应付账款中。
        </p>
      </section>
      <section className="sl-card">
        <h2>人物与家庭实际流水</h2>
        <p className="sl-muted">
          截至第 {cursor} 月，最近八十笔。完整全社会流水由 Node 批量运行导出
          NDJSON。
        </p>
        <div className="sl-table-wrap">
          <table>
            <thead>
              <tr>
                <th>月</th>
                <th>付款 → 收款</th>
                <th>用途</th>
                <th>金额 / 元</th>
                <th>原因</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((l) => (
                <tr key={l.id}>
                  <td>{l.month}</td>
                  <td>
                    {l.from} → {l.to}
                  </td>
                  <td>{l.category}</td>
                  <td>{money(l.amount)}</td>
                  <td>{l.causeId}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <details className="sl-card sl-details">
        <summary>期末全社会账户与债权 · 第 {run.finalWorld.month} 月</summary>
        <p className="sl-muted">
          以下是期末世界快照，和上方的历史月份流水分别展示。不把股权价值再次加计为现金。
        </p>
        <div className="sl-table-wrap sl-table-scroll">
          <table>
            <thead>
              <tr>
                <th>账户</th>
                <th>类别</th>
                <th>余额 / 元</th>
              </tr>
            </thead>
            <tbody>
              {Object.values(run.finalWorld.accounts)
                .sort((a, b) => b.balance - a.balance)
                .map((a) => (
                  <tr key={a.id}>
                    <td>{a.id}</td>
                    <td>{a.kind}</td>
                    <td>{money(a.balance)}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
        <h3>未清偿债权</h3>
        <div className="sl-table-wrap">
          <table>
            <thead>
              <tr>
                <th>债务人</th>
                <th>债权人</th>
                <th>类别</th>
                <th>金额 / 元</th>
              </tr>
            </thead>
            <tbody>
              {Object.values(run.finalWorld.claims).map((c) => (
                <tr key={c.id}>
                  <td>{c.debtorAccountId}</td>
                  <td>{c.creditorAccountId}</td>
                  <td>{c.category}</td>
                  <td>{money(c.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}

export function SocialComparison({
  run,
  parent,
  cursor,
  personId,
  onBranch,
  busy,
  onJump,
}: {
  run: WorldRun;
  parent: WorldRun | null;
  cursor: number;
  personId: string;
  onBranch: (punitive: number, learning: boolean) => void;
  busy: boolean;
  onJump: (month: number) => void;
}) {
  const [punitive, setPunitive] = useState(0.8),
    [learning, setLearning] = useState(true),
    canBranch = cursor < run.config.months;
  const comparison = parent && run.parent?.runId === parent.id ? parent : null;
  const firstDifference = useMemo(() => {
    if (!comparison) return null;
    const original = new Map(
      comparison.events
        .filter((e) => e.kind === "action" && e.observations[personId])
        .map((e) => [`${e.month}/${e.substep}`, e]),
    );
    return (
      run.events.find(
        (e) =>
          e.kind === "action" &&
          e.month > (run.parent?.month ?? 0) &&
          e.observations[personId] &&
          e.observations[personId].action !==
            original.get(`${e.month}/${e.substep}`)?.observations[personId]
              .action,
      ) ?? null
    );
  }, [comparison, run, personId]);
  return (
    <div className="sl-stack">
      <section className="sl-card">
        <div className="sl-section-title">
          <div>
            <span className="sl-kicker">COUNTERFACTUAL WORLD</span>
            <h2>改变规则，让整个社会继续</h2>
          </div>
          <GitBranch size={23} />
        </div>
        <p className="sl-muted">
          从第 {cursor}{" "}
          月的真实世界恢复，保留家庭、岗位、关系、账本和信念。所有企业从下个月起采用选定处罚倾向；外部随机键保持一致。
        </p>
        <div className="sl-form-grid">
          <label>
            处罚倾向 ρ
            <select
              value={punitive}
              onChange={(e) => setPunitive(Number(e.target.value))}
            >
              <option value="0.2">0.2 · 较低处罚倾向</option>
              <option value="0.8">0.8 · 较高处罚倾向</option>
            </select>
          </label>
          <label>
            信念学习
            <select
              value={String(learning)}
              onChange={(e) => setLearning(e.target.value === "true")}
            >
              <option value="true">开启 · 从新反馈更新</option>
              <option value="false">关闭 · 保留分支时的信念</option>
            </select>
          </label>
        </div>
        <p className="sl-footnote">
          为单独识别信念机制，本次干预锁定处罚政策，同时关闭习惯与机构学习。惩罚倾向与证据响应仍是独立参数。
        </p>
        <button
          className="sl-primary"
          disabled={busy || !canBranch}
          onClick={() => onBranch(punitive, learning)}
        >
          <GitBranch size={16} />
          从当前月份建立平行社会
        </button>
        {!canBranch && <p className="sl-muted">请先把游标移到观察终点之前。</p>}
      </section>
      {comparison ? (
        <section className="sl-card">
          <h2>个体差异与群体溢出</h2>
          <p className="sl-muted">
            共同起点：第 {run.parent!.month} 月；当前比较：第 {cursor} 月。
          </p>
          <div className="sl-compare-grid">
            {[comparison, run].map((r, i) => {
              const f = r.frames[personId]?.find((f) => f.month === cursor),
                m = r.metrics[cursor];
              return (
                <article key={r.id}>
                  <span className="sl-kicker">
                    {i ? "干预世界" : "原始世界"}
                  </span>
                  <h3>{r.name}</h3>
                  <dl>
                    <dt>个人现金</dt>
                    <dd>¥{money(f?.cash ?? 0)}</dd>
                    <dt>本月到账</dt>
                    <dd>¥{money(f?.person.employment.lastIncome ?? 0)}</dd>
                    <dt>社会就业比例</dt>
                    <dd>{percent(m.employmentRate)}</dd>
                    <dt>累计公开报告</dt>
                    <dd>{m.publicReports}</dd>
                    <dt>社会消费缺口</dt>
                    <dd>¥{money(m.consumptionGap)}</dd>
                  </dl>
                </article>
              );
            })}
          </div>
          <p className="sl-callout">
            {firstDifference
              ? `后续首次选择分化：第 ${firstDifference.month} 月第 ${firstDifference.substep + 1} 子步，分支中选择「${ACTION_NAMES[firstDifference.observations[personId].action as ActionKind]}」。当前月份个人现金差 ¥${money((run.frames[personId]?.[cursor]?.cash ?? 0) - (comparison.frames[personId]?.[cursor]?.cash ?? 0))}。`
              : "观察人物的时间安排尚未出现分化；社会其他成员仍可能受到干预影响。"}
          </p>
          <div className="sl-actions">
            {[12, 60].map((offset) => {
              const month = run.parent!.month + offset;
              return (
                <button
                  className="sl-secondary"
                  key={offset}
                  disabled={month > run.config.months}
                  onClick={() => onJump(month)}
                >
                  查看{offset === 12 ? "一年" : "五年"}后 · 第 {month} 月
                </button>
              );
            })}
          </div>
          <Trend
            values={run.metrics
              .slice(0, cursor + 1)
              .map(
                (m, i) =>
                  m.employmentRate - comparison.metrics[i].employmentRate,
              )}
            label="干预与原始世界的就业比例差"
          />
          <p className="sl-footnote">
            此处是单个合成世界的条件差异；正式政策效应应查看跨独立世界种子的配对实验。
          </p>
        </section>
      ) : (
        <section className="sl-card sl-empty">
          <GitBranch size={34} />
          <h3>同一份社会快照，另一种制度回应</h3>
          <p>建立分支后，在这里比较个人轨迹与共享资源的变化。</p>
        </section>
      )}
    </div>
  );
}

export function ParameterSources({ run }: { run: WorldRun | null }) {
  const bundle = parameterBundle(run?.finalWorld.parameters);
  return (
    <section className="sl-card">
      <div className="sl-section-title">
        <div>
          <span className="sl-kicker">ASSUMPTIONS REGISTER</span>
          <h2>参数有来源，假设有边界</h2>
        </div>
        <Brain size={22} />
      </div>
      <p className="sl-callout">
        {bundle.id} ·
        全部为合成假设，尚未实证标定。模型内部实验不能替代现实数据验证。
      </p>
      <p className="sl-muted">
        借鉴 PersonaOS 的分层记录、PsychSim 的主观信念、FAtiMA 的事件评价和
        SimPaths 的制度结算思想。当前参数与公式是本项目的建模假设。
      </p>
      <div className="sl-table-wrap">
        <table>
          <thead>
            <tr>
              <th>参数</th>
              <th>数值</th>
              <th>单位</th>
              <th>适用与证据</th>
            </tr>
          </thead>
          <tbody>
            {bundle.evidence.map((e) => (
              <tr key={e.key}>
                <td>{e.key}</td>
                <td>{JSON.stringify(e.value)}</td>
                <td>{e.unit}</td>
                <td>合成人口 · 未标定</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="sl-references">
        <a
          href="https://arxiv.org/abs/2609.27417"
          target="_blank"
          rel="noreferrer"
        >
          PersonaOS ↗
        </a>
        <a
          href="https://ijcai.org/proceedings/2005/208"
          target="_blank"
          rel="noreferrer"
        >
          PsychSim ↗
        </a>
        <a
          href="https://arxiv.org/abs/2103.03020"
          target="_blank"
          rel="noreferrer"
        >
          FAtiMA ↗
        </a>
        <a
          href="https://microsimulation.pub/articles/00318/"
          target="_blank"
          rel="noreferrer"
        >
          SimPaths ↗
        </a>
      </div>
    </section>
  );
}
