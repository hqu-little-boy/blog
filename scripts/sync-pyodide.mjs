import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const projectRoot = path.resolve(__dirname, "..");
const srcDir = path.resolve(projectRoot, "node_modules/pyodide");
const targetDir = path.resolve(projectRoot, "public/vendor/pyodide");

const requiredFiles = [
  "pyodide.js",
  "pyodide.asm.js",
  "pyodide.asm.wasm",
  "python_stdlib.zip",
  "pyodide-lock.json",
  "pyodide.mjs",
];

if (!fs.existsSync(srcDir)) {
  console.warn("⚠️ node_modules/pyodide not found. Skipping sync.");
  process.exit(0);
}

fs.mkdirSync(targetDir, { recursive: true });

for (const file of requiredFiles) {
  const src = path.join(srcDir, file);
  const dest = path.join(targetDir, file);
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, dest);
    const sizeMb = (fs.statSync(dest).size / (1024 * 1024)).toFixed(2);
    console.log(`Synced ${file} (${sizeMb} MB) -> ${targetDir}`);
  } else {
    console.warn(`Warning: ${file} not found in node_modules/pyodide`);
  }
}

console.log("Pyodide assets sync complete.");
