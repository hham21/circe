import { describe, it, expect } from "vitest";
import { findJsonString, parseTrailingOptions } from "../src/utils.js";

describe("findJsonString", () => {
  it("extracts JSON from code block", () => {
    const text = 'Some text\n```json\n{"key": "value"}\n```\nMore text';
    expect(findJsonString(text)).toBe('{"key": "value"}');
  });

  it("extracts bare JSON object", () => {
    const text = 'Result: {"passed": true, "score": 9}';
    expect(findJsonString(text)).toBe('{"passed": true, "score": 9}');
  });

  it("returns null for no JSON", () => {
    expect(findJsonString("just plain text")).toBeNull();
  });

  it("prefers code block over bare JSON", () => {
    const text = '{"bare": true}\n```json\n{"block": true}\n```';
    expect(findJsonString(text)).toBe('{"block": true}');
  });

  it("uses lazy matching for bare JSON (does not span multiple objects)", () => {
    const text = '{"a": 1} some text {"b": 2}';
    const result = findJsonString(text);
    expect(result).toBe('{"a": 1}');
  });
});

describe("parseTrailingOptions", () => {
  it("separates agents from options", () => {
    const a = { name: "a", run: async () => {} };
    const b = { name: "b", run: async () => {} };
    const opts = { maxRounds: 5 };
    const { agents, options } = parseTrailingOptions([a, b, opts]);
    expect(agents).toEqual([a, b]);
    expect(options).toEqual(opts);
  });

  it("returns all as agents when no options", () => {
    const a = { name: "a", run: async () => {} };
    const b = { name: "b", run: async () => {} };
    const { agents, options } = parseTrailingOptions([a, b]);
    expect(agents).toEqual([a, b]);
    expect(options).toEqual({});
  });

  it("handles empty args", () => {
    const { agents, options } = parseTrailingOptions([]);
    expect(agents).toEqual([]);
    expect(options).toEqual({});
  });
});
