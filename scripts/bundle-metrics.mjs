import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

function formatBytes(value) {
  return value.toLocaleString("en-US");
}

function gzipSize(buffer) {
  return zlib.gzipSync(buffer).length;
}

function summarizeFiles(files) {
  return files.reduce((sum, file) => sum + file.raw, 0);
}

const cwd = process.cwd();
const assetsDir = path.join(cwd, "dist", "assets");
const htmlPath = path.join(cwd, "dist", "index.html");

if (!fs.existsSync(assetsDir)) {
  console.error(`Missing build output: ${assetsDir}`);
  console.error("Run `npm run build` first.");
  process.exit(1);
}

const assetFiles = fs.readdirSync(assetsDir)
  .filter((name) => name.endsWith(".js") || name.endsWith(".css"))
  .sort((a, b) => a.localeCompare(b));

if (assetFiles.length === 0) {
  console.error("No JS/CSS assets found in dist/assets.");
  process.exit(1);
}

const measured = assetFiles.map((name) => {
  const abs = path.join(assetsDir, name);
  const content = fs.readFileSync(abs);
  return {
    name,
    raw: content.length,
    gzip: gzipSize(content),
    type: name.endsWith(".js") ? "js" : "css",
  };
});

const jsFiles = measured.filter((file) => file.type === "js");
const cssFiles = measured.filter((file) => file.type === "css");
const htmlContent = fs.existsSync(htmlPath) ? fs.readFileSync(htmlPath, "utf8") : "";
const entryMatch = htmlContent.match(/<script[^>]+src="\/assets\/([^"]+\.js)"/i);
const entryFileFromHtml = entryMatch?.[1] ?? null;
const entryJs = (entryFileFromHtml
  ? jsFiles.find((file) => file.name === entryFileFromHtml)
  : null) ?? jsFiles.find((file) => /^index-.*\.js$/.test(file.name)) ?? jsFiles[0] ?? null;

const summary = {
  chunkCount: measured.length,
  jsChunkCount: jsFiles.length,
  cssChunkCount: cssFiles.length,
  entryJsFile: entryJs?.name ?? null,
  entryJsRaw: entryJs?.raw ?? 0,
  entryJsGzip: entryJs?.gzip ?? 0,
  totalJsRaw: summarizeFiles(jsFiles),
  totalJsGzip: jsFiles.reduce((sum, file) => sum + file.gzip, 0),
  totalCssRaw: summarizeFiles(cssFiles),
  totalCssGzip: cssFiles.reduce((sum, file) => sum + file.gzip, 0),
};

console.log("Bundle metrics (dist/assets)");
console.log(`- chunks: ${summary.chunkCount} (js: ${summary.jsChunkCount}, css: ${summary.cssChunkCount})`);
if (entryJs) {
  console.log(`- entry js: ${summary.entryJsFile}`);
  console.log(`  raw: ${formatBytes(summary.entryJsRaw)} bytes`);
  console.log(`  gzip: ${formatBytes(summary.entryJsGzip)} bytes`);
}
console.log(`- total js raw: ${formatBytes(summary.totalJsRaw)} bytes`);
console.log(`- total js gzip: ${formatBytes(summary.totalJsGzip)} bytes`);
console.log(`- total css raw: ${formatBytes(summary.totalCssRaw)} bytes`);
console.log(`- total css gzip: ${formatBytes(summary.totalCssGzip)} bytes`);

console.log("\nAssets:");
measured.forEach((file) => {
  console.log(`- ${file.name} [${file.type}] raw=${formatBytes(file.raw)} gzip=${formatBytes(file.gzip)}`);
});
