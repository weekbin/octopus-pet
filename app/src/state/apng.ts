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
  // 2026-09-11 诊断 (B/D canvas 未绘制): 详细 log
  console.log(`[webview-diag] loadApng: fetch start url=${url}`);
  const res = await fetch(url);
  console.log(
    `[webview-diag] loadApng: fetch done url=${url} status=${res.status} ok=${res.ok} contentType=${res.headers.get("content-type")} size=${res.headers.get("content-length")}`,
  );
  if (!res.ok) {
    throw new Error(`loadApng: HTTP ${res.status} fetching ${url}`);
  }
  const buf = await res.arrayBuffer();
  console.log(
    `[webview-diag] loadApng: got ArrayBuffer url=${url} bytes=${buf.byteLength}`,
  );
  const apng = parseAPNG(buf);
  if (apng instanceof Error) {
    console.error(
      `[webview-diag] loadApng: parseAPNG returned Error url=${url} message=${apng.message}`,
    );
    throw new Error(`loadApng: parse failed for ${url}: ${apng.message}`);
  }
  console.log(
    `[webview-diag] loadApng: parse ok url=${url} width=${apng.width} height=${apng.height} frames=${(apng as { frames?: unknown[] }).frames?.length ?? "?"} playTime=${apng.playTime}`,
  );
  return apng;
}
