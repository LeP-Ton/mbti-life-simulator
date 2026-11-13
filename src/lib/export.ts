import {
  DOMAIN_NAMES,
  monthLabel,
  moneyLabel,
  STAGE_NAMES,
} from "../simulation/config";
import { environmentAt } from "../simulation/engine";
import type { LifeRun } from "../simulation/types";

export const escapeHtml = (value: string): string =>
  value.replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        char
      ]!,
  );
export function download(content: string, name: string, type: string): void {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
export function buildLifeHtml(run: LifeRun, cursor = 540): string {
  const state = run.snapshots[cursor];
  const environment = environmentAt(run, cursor);
  const e = escapeHtml;
  const events = run.events.filter(
    (event) => event.month <= cursor && event.important,
  );
  return `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${e(run.name)} · 人生年表</title><style>body{font:16px/1.9 system-ui,sans-serif;background:#f6f5ef;color:#29392f;margin:0}main{max-width:800px;margin:50px auto;padding:28px}small{letter-spacing:2px;color:#657369}h1{font-size:38px;line-height:1.4}header{border-bottom:2px solid #2f5744;padding-bottom:24px}article{border-left:2px solid #c8d6bd;padding:0 0 28px 26px}h2{font-size:21px}time{color:#668054}details{background:#eeeee4;padding:12px;border-radius:8px}.grid{display:flex;flex-wrap:wrap;gap:16px}.grid p{flex:1;min-width:130px}footer{font-size:13px;color:#788073;border-top:1px solid #ccc;padding-top:20px}@media print{body{background:white}main{margin:0}article{break-inside:avoid}}</style><main><header><small>GAMEX / LIFE ARCHIVE</small><h1>${e(run.name)}</h1><p>${e(run.character.inference.type ?? "类型待区分")} · ${monthLabel(cursor)} · ${STAGE_NAMES[state.stage]} · ${e(environment.name)}</p><p>人格只是故事的起点。选择、练习与环境，让每段人生有了自己的形状。</p></header><section class="grid"><p>学习<br><b>${state.development.studyHours.toLocaleString()} 小时</b></p><p>作品<br><b>${state.development.works.length} 份</b></p><p>储备<br><b>${moneyLabel(state.dynamic.money)}</b></p><p>满意度<br><b>${state.dynamic.satisfaction}</b></p></section>${events.map((event) => `<article><time>${monthLabel(event.month)}</time><h2>${e(event.title)}</h2><p>${e(event.summary)}</p><details><summary>查看选择与原因</summary><p>条件：${event.conditions.map(e).join("；") || "承接前序经历"}</p><p>原始表现：${e(event.raw)}</p><p>外界评价：${e(event.evaluation)}</p><p>影响：${event.impacts.map(e).join("；")}</p>${event.choices.map((choice) => `<p>${choice.id === event.selected ? "✓ 已选" : "未选"} ${e(choice.label)}：${e(choice.reason)} 代价：${e(choice.cost)}</p>`).join("")}</details></article>`).join("")}<h2>发展档案</h2>${state.development.works.map((work) => `<p>${monthLabel(work.month)} · ${e(work.title)} · ${DOMAIN_NAMES[work.domain]} · 质量 ${work.quality}</p>`).join("")}${cursor === 540 ? `<h2>${e(run.summary.title)}</h2>${run.summary.paragraphs.map((p) => `<p>${e(p)}</p>`).join("")}<p>放弃与代价：${run.summary.forgone.map(e).join("；")}</p><p>仍有可能：${run.summary.possible.map(e).join("；")}</p>` : ""}<footer>规则 ${e(run.version)} · 种子 ${e(run.character.seed)} · 八维为游戏内部指数，非官方测评分数。本游戏不预测现实个人命运。所有姓名、学校与组织均为虚构。</footer></main></html>`;
}
export const exportLifeHtml = (run: LifeRun, cursor: number) =>
  download(
    buildLifeHtml(run, cursor),
    `${run.name}-人生年表.html`,
    "text/html;charset=utf-8",
  );
export const exportLifeJson = (run: LifeRun) =>
  download(
    JSON.stringify({ format: "gamex-life-archive/1", run }, null, 2),
    `${run.name}-完整记录.json`,
    "application/json;charset=utf-8",
  );
