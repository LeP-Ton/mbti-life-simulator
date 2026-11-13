import type { ExperimentReport, WorldRun } from "./types";
import { MODEL_NAMES } from "./config";

export function downloadFile(
  name: string,
  data: string,
  type = "application/json",
) {
  const url = URL.createObjectURL(new Blob([data], { type })),
    a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
export function exportWorld(run: WorldRun) {
  downloadFile(
    `${run.id}.json`,
    JSON.stringify({ format: "social-archive/2", calibrated: false, run }),
  );
}
export const escapeHtml = (value: unknown) =>
  String(value).replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        char
      ]!,
  );
export function exportWorldHtml(
  run: WorldRun,
  personId: string,
  cursor: number,
) {
  const frames = run.frames[personId] ?? [],
    frame = frames.find((f) => f.month === cursor);
  if (!frame) return;
  const name = escapeHtml(frame.person.name),
    rows = run.events
      .filter((e) => e.month <= cursor && e.observations[personId])
      .map(
        (e) =>
          `<article><small>第 ${e.month} 月 · ${escapeHtml(e.ruleId)}</small><h3>${escapeHtml(e.title)}</h3><p>${escapeHtml(JSON.stringify(e.observations[personId]))}</p><small>工时 ${e.hours} h · 金额 ${(e.money / 100).toFixed(2)} 元</small></article>`,
      )
      .join("");
  downloadFile(
    `${run.id}-${personId}-观察.html`,
    `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${name}的社会观察记录</title><style>body{max-width:850px;margin:50px auto;padding:20px;background:#f5f3ec;color:#263c35;font:16px/1.8 system-ui}article{padding:20px 0;border-bottom:1px solid #ccd4c8}small{color:#626e63}p{overflow-wrap:anywhere}</style><h1>${name}的社会观察记录</h1><p>机制实验 · 合成参数未标定 · ${MODEL_NAMES[run.config.model]} · 截至第 ${cursor} 月</p><p>规则 ${escapeHtml(run.ruleVersion)}；种子 ${escapeHtml(run.config.seed)}。本导出仅包含人物当时可观察到的事件；完整社会与账本请使用 JSON 档案。</p>${rows}</html>`,
    "text/html;charset=utf-8",
  );
}
export function exportExperiment(report: ExperimentReport) {
  downloadFile("组织表达实验.json", JSON.stringify(report, null, 2));
}
