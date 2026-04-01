import { describe, it, expect } from "vitest";
import {
  Feature,
  TechStack,
  ProductSpec,
  BuildResult,
  QAReport,
} from "../src/handoff.js";

describe("Feature", () => {
  it("creates a feature", () => {
    const f = Feature.parse({ name: "auth", description: "User authentication" });
    expect(f.name).toBe("auth");
    expect(f.description).toBe("User authentication");
  });
});

describe("TechStack", () => {
  it("creates a tech stack", () => {
    const ts = TechStack.parse({
      frontend: "React",
      backend: "FastAPI",
      database: "SQLite",
    });
    expect(ts.frontend).toBe("React");
  });
});

describe("ProductSpec", () => {
  it("creates a full product spec", () => {
    const spec = ProductSpec.parse({
      appName: "memo-app",
      features: [{ name: "notes", description: "Create notes" }],
      techStack: { frontend: "React", backend: "FastAPI", database: "SQLite" },
      designDirection: "minimal",
    });
    expect(spec.appName).toBe("memo-app");
    expect(spec.features).toHaveLength(1);
    expect(spec.techStack.frontend).toBe("React");
  });
});

describe("BuildResult", () => {
  it("creates a build result", () => {
    const br = BuildResult.parse({
      appDir: "/tmp/app",
      runCommand: "npm start",
      port: 3000,
      selfAssessment: "Looks good",
    });
    expect(br.port).toBe(3000);
  });
});

describe("QAReport", () => {
  it("creates a QA report", () => {
    const qa = QAReport.parse({
      passed: true,
      scores: { design_quality: 8.5, functionality: 9.0 },
      feedback: ["Great work"],
    });
    expect(qa.passed).toBe(true);
    expect(qa.scores.design_quality).toBe(8.5);
    expect(qa.feedback).toHaveLength(1);
  });
});
