// 가장 단순한 테스트: 에이전트 하나가 SDK를 통해 응답하는지 확인
import { BaseAgent } from "../src/agent.js";

const agent = new BaseAgent({
  name: "echo",
  prompt: "You are a helpful assistant. Reply in one short sentence.",
});

console.log("=== 단일 에이전트 ===");
const result = await agent.run("What is 2 + 2?");
console.log("Result:", result);
