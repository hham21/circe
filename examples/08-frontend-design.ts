// Frontend Design preset: Planner → Loop(Generator ⇄ Evaluator)
import { frontendDesign } from "../src/presets/frontend.js";
import { OutputFormatter } from "../src/cli/output.js";
import { setFormatter, setWorkDir, setSkillRegistry } from "../src/context.js";
import { SkillRegistry } from "../src/tools/skills.js";
import { mkdirSync } from "node:fs";
import { join, resolve } from "node:path";

const dir = resolve("./output/dutch-museum");
mkdirSync(dir, { recursive: true });

const fmt = new OutputFormatter(true);
fmt.setLogFile(`${dir}/circe.log`);
setFormatter(fmt);
setWorkDir(dir);
setSkillRegistry(new SkillRegistry([
  join(dir, ".circe", "skills"),
  join(resolve(import.meta.dirname, ".."), ".circe", "skills"),
  join(process.env.HOME!, ".circe", "skills"),
]));

const app = frontendDesign({ iterations: 15 });
const result = await app.run("Dutch art museum website");

console.log("\nFinal:", JSON.stringify(result, null, 2));
