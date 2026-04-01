// Parallel: 세 에이전트가 동시에 같은 질문에 다른 관점으로 답변
import { BaseAgent } from "../src/agent.js";
import { Parallel } from "../src/orchestration/parallel.js";
import { OutputFormatter } from "../src/cli/output.js";
import { setFormatter } from "../src/context.js";

setFormatter(new OutputFormatter(true));

const optimist = new BaseAgent({
  name: "optimist",
  prompt: "You are an optimist. Give a positive one-sentence take on the topic.",
});

const pessimist = new BaseAgent({
  name: "pessimist",
  prompt: "You are a pessimist. Give a negative one-sentence take on the topic.",
});

const realist = new BaseAgent({
  name: "realist",
  prompt: "You are a realist. Give a balanced one-sentence take on the topic.",
});

console.log("=== Parallel: 3 perspectives at once ===");
const parallel = new Parallel(optimist, pessimist, realist);
const result = await parallel.run("AI replacing human jobs");
console.log("Result:", JSON.stringify(result, null, 2));
