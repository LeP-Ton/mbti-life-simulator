import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

export async function thirdPartyNotices(root = process.cwd()): Promise<string> {
  const dependencies = [
    "react",
    "react-dom",
    "lucide-react",
    ...(await readdir(path.join(root, "node_modules/@stdlib")))
      .sort()
      .map((name) => `@stdlib/${name}`),
  ];
  const names: string[] = [],
    texts = new Set<string>();
  for (const dependency of dependencies) {
    const folder = path.join(root, "node_modules", dependency),
      info = JSON.parse(
        await readFile(path.join(folder, "package.json"), "utf8"),
      );
    names.push(
      `${info.name} ${info.version} (${info.license ?? "见许可正文"})`,
    );
    for (const filename of ["LICENSE", "LICENSE.txt", "NOTICE"]) {
      try {
        texts.add((await readFile(path.join(folder, filename), "utf8")).trim());
      } catch {
        /* 组件没有该可选文件时继续读取其他许可正文。 */
      }
    }
    if (dependency.startsWith("@stdlib/")) {
      const library = path.join(folder, "lib");
      for (const filename of (await readdir(library))
        .filter((name) => name.endsWith(".js"))
        .sort()) {
        const source = await readFile(path.join(library, filename), "utf8"),
          header = source.match(/^\/\*\*[\s\S]*?\*\//)?.[0];
        if (header?.includes("@license")) texts.add(header);
      }
    }
  }
  return `第三方组件许可与版权声明\n构建使用的直接组件和已安装的 Stdlib 依赖：\n\n${names.join("\n")}\n\n${[...texts].join("\n\n--------------------\n\n")}\n`;
}
