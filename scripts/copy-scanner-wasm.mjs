// Copies the barcode scanner engine (WebAssembly) into public/ so it is served
// by this app itself, never from a CDN. Runs automatically after `npm install`.
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";

const candidates = [
  "node_modules/zxing-wasm/dist/reader/zxing_reader.wasm",
  "node_modules/barcode-detector/node_modules/zxing-wasm/dist/reader/zxing_reader.wasm",
];
const source = candidates.find((p) => existsSync(p));
if (!source) {
  console.error("Scanner engine (zxing_reader.wasm) not found. Is barcode-detector installed?");
  process.exit(1);
}
const target = path.resolve("public/vendor/zxing_reader.wasm");
mkdirSync(path.dirname(target), { recursive: true });
copyFileSync(source, target);
console.log("Copied scanner engine to public/vendor/zxing_reader.wasm");
