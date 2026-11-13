import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.join(root, "dist");
let html = await readFile(path.join(dist, "index.html"), "utf8");
const scriptTag = html.match(/<script\b[^>]*src="([^"]+)"[^>]*><\/script>/);
if (!scriptTag) throw new Error("未找到生产脚本，无法生成离线版本。");
const script = await readFile(path.join(dist, scriptTag[1].replace(/^\//, "")), "utf8");
// 将运行资源内联，离线版不再请求本地模块文件，支持直接双击打开。
html = html.replace(scriptTag[0], () => `<script type="module">${script.replace(/<\/script/gi, "<\\/script")}</script>`);
for (const match of [...html.matchAll(/<link\b[^>]*rel="stylesheet"[^>]*href="([^"]+)"[^>]*>/g)]) {
  const stylesheet = await readFile(path.join(dist, match[1].replace(/^\//, "")), "utf8");
  html = html.replace(match[0], () => `<style>${stylesheet}</style>`);
}
const output = path.join(root, "outputs", "MBTI人生模拟.html");
await mkdir(path.dirname(output), { recursive: true });
await writeFile(output, html, "utf8");
console.log("离线版已生成：outputs/MBTI人生模拟.html");
