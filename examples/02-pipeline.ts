// Pipeline: 번역 → 포매팅 순차 체이닝
import { BaseAgent } from "../src/agent.js";
import { Pipeline } from "../src/orchestration/pipeline.js";

const translator = new BaseAgent({
  name: "translator",
  prompt: "Translate the input to Korean. Output ONLY the translation, nothing else.",
});

const formatter = new BaseAgent({
  name: "formatter",
  prompt: "Take the input text and add '✅ ' prefix. Output ONLY the prefixed text, nothing else.",
});

console.log("=== Pipeline: translate → format ===");
const pipeline = new Pipeline(translator, formatter);
const result = await pipeline.run("The weather is beautiful today.");
console.log("Result:", result);
