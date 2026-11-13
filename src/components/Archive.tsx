import {
  BookOpen,
  Clock3,
  FileCheck2,
  FolderOpen,
  Handshake,
  Layers3,
} from "lucide-react";
import { DOMAIN_NAMES, monthLabel, STAGE_NAMES } from "../simulation/config";
import { DOMAINS, type LifeRun, type LifeState } from "../simulation/types";

export function Archive({
  run,
  state,
  onJump,
}: {
  run: LifeRun;
  state: LifeState;
  onJump: (month: number) => void;
}) {
  const development = state.development;
  return (
    <div className="archive-view">
      <section className="panel">
        <div className="section-heading">
          <div>
            <span className="eyebrow">WHAT HAS BEEN BUILT</span>
            <h2>
              经历会留下痕迹<span className="heading-dot">.</span>
            </h2>
          </div>
          <span className="outline-badge">截至{monthLabel(state.month)}</span>
        </div>
        <p className="section-description">
          知识、练习与作品分别记录。它们影响机会与后续选择，始终独立于人物的基础八维。
        </p>
        <div className="archive-stats">
          <div>
            <Clock3 size={18} />
            <b>{development.studyHours.toLocaleString()}</b>
            <span>累计学习 / 小时</span>
          </div>
          <div>
            <Layers3 size={18} />
            <b>{development.practiceHours.toLocaleString()}</b>
            <span>自主实践 / 小时</span>
          </div>
          <div>
            <FolderOpen size={18} />
            <b>{development.workMonths}</b>
            <span>实际工作 / 月</span>
          </div>
        </div>
        <h3 className="subheading">
          学习与实践画像 <small>知识接触 / 任务熟悉度</small>
        </h3>
        <div className="domain-chart">
          {DOMAINS.map((domain) => (
            <div key={domain}>
              <span>{DOMAIN_NAMES[domain]}</span>
              <div>
                <i style={{ width: `${development.knowledge[domain]}%` }} />
                <b style={{ width: `${development.practice[domain]}%` }} />
              </div>
              <em>
                {Math.round(development.knowledge[domain])} /{" "}
                {Math.round(development.practice[domain])}
              </em>
            </div>
          ))}
        </div>
        <div className="chart-legend">
          <span>
            <i />
            知识接触
          </span>
          <span>
            <i />
            实际练习
          </span>
        </div>
        <p className="subtle-note">
          这些是发展档案的游戏熟悉度指标，不是一套新增的底层天赋。
        </p>
      </section>
      <div className="archive-grid">
        <section className="panel">
          <div className="card-label">
            <h3>
              <BookOpen size={17} />
              成绩与学习记录
            </h3>
            <span>{development.exams.length} 次测评</span>
          </div>
          {development.credentials.map((item, i) => (
            <div className="record-item" key={`${item.month}-${i}`}>
              <FileCheck2 size={16} />
              <div>
                <strong>{item.title}</strong>
                <p>
                  {item.institution} · {monthLabel(item.month)}
                </p>
              </div>
            </div>
          ))}
          {development.exams.length ? (
            <table className="exam-table">
              <thead>
                <tr>
                  <th>时间</th>
                  <th>测评</th>
                  <th>成绩</th>
                  <th>前列比例</th>
                </tr>
              </thead>
              <tbody>
                {development.exams.map((exam) => (
                  <tr key={exam.month}>
                    <td>{monthLabel(exam.month)}</td>
                    <td>{exam.name}</td>
                    <td>{exam.score}</td>
                    <td>前 {exam.rank}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="empty-copy">第一个学期结束时，成绩会自动归档。</p>
          )}
        </section>
        <section className="panel">
          <div className="card-label">
            <h3>
              <Handshake size={17} />
              关键关系
            </h3>
            <span>{development.relations.length} 段</span>
          </div>
          {development.relations.map((relation) => (
            <div className="relation-record" key={relation.name}>
              <div className="relation-avatar">{relation.name.slice(0, 1)}</div>
              <div>
                <strong>
                  {relation.name}
                  <small>{relation.role}</small>
                </strong>
                <p>{relation.contribution}</p>
                <span>
                  始于{monthLabel(relation.since)} · 信任 {relation.trust}
                </span>
              </div>
            </div>
          ))}
          <h3 className="subheading">本月的时间去向</h3>
          <div className="allocation-bar">
            {Object.entries(state.allocation)
              .filter(([, value]) => value > 0)
              .map(([key, value]) => (
                <i
                  key={key}
                  className={`allocation-${key}`}
                  style={{ width: `${(value / 160) * 100}%` }}
                  title={`${key}: ${value} 小时`}
                />
              ))}
          </div>
          <div className="allocation-labels">
            {Object.entries(state.allocation).map(([key, value]) => (
              <span key={key}>
                <i className={`allocation-${key}`} />
                {
                  {
                    study: "学习",
                    practice: "实践",
                    work: "工作或求职",
                    connection: "关系",
                    rest: "休息",
                  }[key]
                }{" "}
                {value}h
              </span>
            ))}
          </div>
          <p className="subtle-note">
            每月仅分配 160 小时自主时间；不代表整个月的全部生活时长。
          </p>
        </section>
      </div>
      <section className="panel">
        <div className="section-heading">
          <div>
            <span className="eyebrow">A PORTFOLIO OF REAL ATTEMPTS</span>
            <h2>亲手做过的事</h2>
          </div>
          <span className="outline-badge">
            {development.works.length} 份作品
          </span>
        </div>
        <div className="works-grid">
          {development.works.map((work, index) => (
            <button
              className="work-card"
              key={work.id}
              onClick={() => onJump(work.month)}
            >
              <span className={`work-cover cover-${index % 3}`}>
                <FolderOpen size={32} />
                <span>NO. {String(index + 1).padStart(2, "0")}</span>
              </span>
              <span className="work-domain">
                {DOMAIN_NAMES[work.domain]} · {monthLabel(work.month)}
              </span>
              <strong>{work.title}</strong>
              <p>{work.contribution}</p>
              <small>
                原始质量 {work.quality} / 100 <span>回看发生时刻 ↗</span>
              </small>
            </button>
          ))}
          {!development.works.length && (
            <div className="empty-state">
              <FolderOpen size={30} />
              <h3>作品集还在等第一份尝试</h3>
              <p>学习、项目和现场实践会自动在这里留下记录。</p>
            </div>
          )}
        </div>
      </section>
      <p className="subtle-note archive-provenance">
        档案来源：{run.version} · 第 {state.month} 月真实快照 ·{" "}
        {STAGE_NAMES[state.stage]}。图表与人生时间线共用同一份模拟记录。
      </p>
    </div>
  );
}
