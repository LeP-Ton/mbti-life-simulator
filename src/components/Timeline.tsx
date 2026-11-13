import {
  BookOpen,
  BriefcaseBusiness,
  ChevronDown,
  CornerDownRight,
  Flag,
  Heart,
  Link2,
  Sparkles,
} from "lucide-react";
import { useMemo, useState } from "react";
import { monthLabel, STAGE_NAMES, TOTAL_MONTHS } from "../simulation/config";
import { CHAINS } from "../simulation/events";
import type {
  EventCategory,
  LifeEvent,
  LifeRun,
  Stage,
} from "../simulation/types";

export const EventIcon = ({
  category,
  size = 16,
}: {
  category: EventCategory;
  size?: number;
}) =>
  category === "learning" ? (
    <BookOpen size={size} />
  ) : category === "career" ? (
    <BriefcaseBusiness size={size} />
  ) : category === "turning" ? (
    <Flag size={size} />
  ) : (
    <Heart size={size} />
  );
export function EventCard({
  event,
  run,
  onJump,
}: {
  event: LifeEvent;
  run: LifeRun;
  onJump: (month: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const selected = event.choices.find((choice) => choice.id === event.selected);
  return (
    <article
      className={`event-card event-${event.category} ${event.important ? "event-important" : ""}`}
      id={`event-${event.id}`}
    >
      <div className="event-node">
        <EventIcon category={event.category} />
      </div>
      <div className="event-meta">
        <span>
          {monthLabel(event.month)}
          <span className="event-month"> / 第 {event.month} 月</span>
        </span>
        {event.important && (
          <span className="tiny-tag">
            <Sparkles size={10} />
            人生节点
          </span>
        )}
      </div>
      <h3>{event.title}</h3>
      <p>{event.summary}</p>
      {event.important && (
        <div className="evaluation">
          <span>
            {event.category === "learning"
              ? "学校的评价"
              : event.category === "career"
                ? "组织的评价"
                : "外界的解释"}
          </span>
          <p>{event.evaluation}</p>
        </div>
      )}
      <div className="event-footer">
        {selected ? (
          <span>
            <CornerDownRight size={13} />
            自动选择：{selected.label}
          </span>
        ) : (
          <span>{event.impacts[0] ?? "记录已进入人生档案"}</span>
        )}
        <button
          className="text-button"
          onClick={() => setOpen(!open)}
          aria-expanded={open}
        >
          {open ? "收起原因" : "查看原因"}
          <ChevronDown size={13} className={open ? "rotate" : ""} />
        </button>
      </div>
      {open && (
        <div className="event-detail">
          <div>
            <b>发生条件</b>
            <p>
              {event.conditions.length
                ? event.conditions.join("；")
                : "承接已有经历、当前任务与月份条件。"}
            </p>
          </div>
          {event.choices.length > 0 && (
            <div>
              <b>人物考虑过的选择</b>
              {event.choices.map((choice) => (
                <div
                  className={`choice-record ${event.selected === choice.id ? "chosen" : ""}`}
                  key={choice.id}
                >
                  <strong>
                    {event.selected === choice.id ? "✓ 已选" : "未选"} ·{" "}
                    {choice.label}
                  </strong>
                  <p>{choice.reason}</p>
                  <small>机会成本：{choice.cost}</small>
                </div>
              ))}
            </div>
          )}
          <div>
            <b>原始表现</b>
            <p>{event.raw}</p>
          </div>
          <div>
            <b>外界评价</b>
            <p>{event.evaluation}</p>
          </div>
          <div>
            <b>直接影响</b>
            <p>
              {event.impacts.join("；") || "记录进入后续机会与策略的判断。"}
            </p>
          </div>
          {event.opportunity && (
            <div>
              <b>机会来源与期限</b>
              <p>
                {event.opportunity.source} · {event.opportunity.requirement} ·
                截至{monthLabel(event.opportunity.deadline)} ·{" "}
                {event.opportunity.outcome}
              </p>
            </div>
          )}
          {event.chainId && (
            <div className="cause-label">
              <Link2 size={13} />
              {CHAINS.find((chain) => chain.id === event.chainId)?.name}
            </div>
          )}
          {event.links.map((id) => {
            const parent = run.events.find((item) => item.id === id);
            return (
              parent && (
                <button
                  key={id}
                  className="linked-event"
                  onClick={() => onJump(parent.month)}
                >
                  ↖ 回看前因：{monthLabel(parent.month)} · {parent.title}
                </button>
              )
            );
          })}
          <div className="context-months">
            <span>相邻月份</span>
            {[-2, -1, 0, 1, 2]
              .filter(
                (offset) =>
                  event.month + offset >= 0 && event.month + offset <= 540,
              )
              .map((offset) => (
                <button
                  key={offset}
                  onClick={() => onJump(event.month + offset)}
                >
                  {monthLabel(event.month + offset)}
                </button>
              ))}
          </div>
        </div>
      )}
    </article>
  );
}

export function StageRail({
  run,
  cursor,
  onJump,
}: {
  run: LifeRun;
  cursor: number;
  onJump: (month: number) => void;
}) {
  const stages = useMemo(() => {
    const list: { stage: Stage; first: number; last: number }[] = [];
    for (const state of run.snapshots) {
      const found = list.find((item) => item.stage === state.stage);
      if (found) found.last = state.month;
      else
        list.push({
          stage: state.stage,
          first: state.month,
          last: state.month,
        });
    }
    return list;
  }, [run]);
  return (
    <div className="stage-rail" aria-label="人生阶段导航">
      {stages.map(({ stage, first, last }, index) => (
        <button
          key={stage}
          className={
            run.snapshots[cursor].stage === stage
              ? "active"
              : cursor > last
                ? "complete"
                : ""
          }
          onClick={() => onJump(first)}
        >
          <span className="stage-number">
            {cursor > last ? "✓" : `0${index + 1}`}
          </span>
          <span>
            {STAGE_NAMES[stage]}
            <small>
              {15 + Math.floor(first / 12)}—
              {Math.min(60, 15 + Math.ceil(last / 12))} 岁
            </small>
          </span>
        </button>
      ))}
    </div>
  );
}

export function Timeline({
  run,
  cursor,
  onJump,
}: {
  run: LifeRun;
  cursor: number;
  onJump: (month: number) => void;
}) {
  const [filter, setFilter] = useState("all"),
    [limit, setLimit] = useState(12);
  const filters = [
    { id: "all", name: "全部经历" },
    { id: "important", name: "关键转折" },
    { id: "learning", name: "学业" },
    { id: "career", name: "事业" },
    { id: "life", name: "日常" },
  ];
  const visible = run.events
    .filter(
      (event) =>
        event.month <= cursor &&
        (filter === "all" ||
          (filter === "important"
            ? event.important
            : event.category === filter)),
    )
    .slice()
    .reverse();
  const displayed = visible.slice(0, limit);
  return (
    <section className="panel timeline-panel">
      <div className="section-heading">
        <div>
          <span className="eyebrow">THE STORY SO FAR</span>
          <h2>
            人生正在发生<span className="heading-dot">.</span>
          </h2>
        </div>
        <span className="muted small">
          {run.events.filter((event) => event.month <= cursor).length} 段记录 ·
          最新在上
        </span>
      </div>
      {cursor === TOTAL_MONTHS && (
        <div className="summary-card">
          <span className="eyebrow">A LIFE, IN MANY WAYS</span>
          <h2>{run.summary.title}</h2>
          {run.summary.paragraphs.map((p) => (
            <p key={p}>{p}</p>
          ))}
          <div className="summary-columns">
            <div>
              <h4>获得的</h4>
              {run.summary.gained.map((item) => (
                <p key={item}>{item}</p>
              ))}
            </div>
            <div>
              <h4>付出的</h4>
              {run.summary.forgone.map((item) => (
                <p key={item}>{item}</p>
              ))}
            </div>
            <div>
              <h4>仍有可能</h4>
              {run.summary.possible.map((item) => (
                <p key={item}>{item}</p>
              ))}
            </div>
          </div>
        </div>
      )}
      <div className="timeline-filters">
        {filters.map((item) => (
          <button
            key={item.id}
            className={filter === item.id ? "active" : ""}
            onClick={() => {
              setFilter(item.id);
              setLimit(12);
            }}
          >
            {item.name}
          </button>
        ))}
      </div>
      <div className="timeline-events">
        {displayed.map((event, index) => (
          <div key={event.id}>
            {(index === 0 ||
              Math.floor(displayed[index - 1].month / 12) !==
                Math.floor(event.month / 12)) && (
              <div className="year-label">
                <span>{15 + Math.floor(event.month / 12)}</span>岁 <i />
                {run.snapshots[event.month].stage === "school"
                  ? "写在课本边缘的日子"
                  : run.snapshots[event.month].stage === "later"
                    ? "经验与生活的另一页"
                    : "沿着自己的路继续"}
              </div>
            )}
            <EventCard event={event} run={run} onJump={onJump} />
          </div>
        ))}
        {!visible.length && (
          <div className="empty-state">
            <BookOpen size={30} />
            <h3>这一页还没有写到</h3>
            <p>继续播放，新的经历会自动进入时间线。</p>
          </div>
        )}
      </div>
      {visible.length > limit && (
        <button className="load-more" onClick={() => setLimit(limit + 16)}>
          回看更早的 {Math.min(16, visible.length - limit)} 段经历{" "}
          <ChevronDown size={14} />
        </button>
      )}
      {cursor < 12 && (
        <div className="timeline-note">
          <LeafIcon />
          没有每天的任务清单，只有慢慢展开的人生。
          <small>点击下方播放，人物会自己学习、选择与生活。</small>
        </div>
      )}
    </section>
  );
}
const LeafIcon = () => <span className="note-sprout">⌁</span>;
