import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, "..");

const mode = process.argv[2];

if (!mode || !["npm", "github"].includes(mode)) {
  console.error("Usage: node scripts/sync-readme.mjs <npm|github>");
  process.exit(1);
}

const source = path.join(root, mode === "npm" ? "README.npm.md" : "README.github.md");
const target = path.join(root, "README.md");

const content = await fs.readFile(source, "utf8");
await fs.writeFile(target, content, "utf8");

console.log(`Synced ${path.basename(source)} -> README.md`);
