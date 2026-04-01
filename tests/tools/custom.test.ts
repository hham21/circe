import { describe, it, expect } from "vitest";
import { tool } from "../../src/tools/custom.js";

describe("tool decorator", () => {
  it("marks a function as a circe tool", () => {
    const myTool = tool(function search(query: string) {
      return `results for ${query}`;
    });

    expect(myTool._circeTool).toBe(true);
    expect(myTool._circeToolName).toBe("search");
  });

  it("preserves original function behavior", () => {
    const myTool = tool(function add(a: number, b: number) {
      return a + b;
    });

    expect(myTool(2, 3)).toBe(5);
  });
});
