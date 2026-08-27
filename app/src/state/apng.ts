// Octopus Pet — APNG loader. 把 apng-js 1.1.5 的 CJS/UMD import 收敛到这一处,
// 对外只暴露干净的 `loadApng(url): Promise<APNG>`, 业务代码不再关心
// Vite CJS interop 的 unwrap 行为.

import apngJsModuleRaw, { type APNG } from "apng-js";

// apng-js 实际导出形态取决于运行环境:
//   - Vite + CJS (__esModule=true)   → 默认导出就是 parseAPNG 函数本身
//   - Vite + CJS (__esModule=false)  → 默认导出是 { parseAPNG, ... } exports 对象
//   - esm.sh                          → default 导出 = parseAPNG 函数
// 三种兼容: typeof check 短路函数形态, 否则取 exports.parseAPNG / exports.default.
type ParseAPNG = (buf: ArrayBuffer) => APNG | Error;

const parseAPNG: ParseAPNG =
  typeof apngJsModuleRaw === "function"
    ? (apngJsModuleRaw as unknown as ParseAPNG)
    : ((apngJsModuleRaw as any).parseAPNG ??
      (apngJsModuleRaw as any).default?.parseAPNG ??
      (apngJsModuleRaw as any).default);

/**
 * Fetch + parse an APNG file from a public URL.
 * @throws if fetch fails, response is not OK, or apng-js returns an Error instance.
 */
export async function loadApng(url: string): Promise<APNG> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`loadApng: HTTP ${res.status} fetching ${url}`);
  }
  const buf = await res.arrayBuffer();
  const apng = parseAPNG(buf);
  if (apng instanceof Error) {
    throw new Error(`loadApng: parse failed for ${url}: ${apng.message}`);
  }
  return apng;
}
