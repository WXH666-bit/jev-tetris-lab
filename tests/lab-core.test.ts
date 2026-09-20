import { describe, it, expect } from "vitest";
import {
  createPath,
  pathCandidates,
  applyPath,
  pathTerminal,
  pathMetrics,
  shortestPath,
  pathStateSchema,
} from "../shared/experiments/pathfinding";
import { templates } from "../shared/experiments/playground";
import {
  questionsSchema,
  parseAnswers,
  mockAnswers,
  sameRunIdentity,
} from "../shared/lab/contracts";
import {
  validateExperiment,
  experimentDefinitions,
} from "../shared/experiments/registry";
import { redact } from "../shared/lab/redact";
import { budgetError } from "../shared/lab/runtime";
describe("platform core and path planning", () => {
  it("registers exactly three available experiments", () =>
    expect(experimentDefinitions.map((e) => e.id)).toEqual([
      "tetris",
      "pathfinding",
      "playground",
    ]));
  it.each([0, 1, 42, 99, 123456, 4294967295])(
    "seed %i produces a reproducible solvable map",
    (seed) => {
      const a = createPath(seed),
        b = createPath(seed);
      expect(a).toEqual(b);
      expect(shortestPath(a.grid, a.start, a.goal).length).toBeGreaterThan(1);
      expect(pathStateSchema.safeParse(a).success).toBe(true);
    },
  );
  it("BFS baseline reaches the goal with legal adjacent steps", () => {
    let s = createPath(42);
    const baseline = shortestPath(s.grid, s.start, s.goal).length - 1;
    while (!pathTerminal(s)) {
      const c = pathCandidates(s)[0];
      const next = applyPath(s, c.id);
      expect(
        Math.abs(next.position.x - s.position.x) +
          Math.abs(next.position.y - s.position.y),
      ).toBe(1);
      expect(next.grid[next.position.y][next.position.x]).toBe(0);
      s = next;
    }
    expect(pathTerminal(s)).toBe("success");
    expect(pathMetrics(s).实际步数).toBe(baseline);
    expect(pathMetrics(s).重复访问次数).toBe(0);
  });
  it("rejects walls, non-adjacent actions and terminal actions", () => {
    let s = createPath(42, 1);
    expect(() => applyPath(s, "up")).toThrow();
    s = applyPath(s, pathCandidates(s)[0].id);
    expect(pathTerminal(s)).toBe("exhausted");
    expect(() => applyPath(s, pathCandidates(s)[0].id)).toThrow();
  });
  it("counts repeated visits without labeling them a success", () => {
    const s = createPath(0);
    s.grid = s.grid.map((r) => r.map(() => 0));
    const a = applyPath(applyPath(s, "right"), "left");
    expect(pathMetrics(a).重复访问次数).toBe(1);
    expect(pathMetrics(a).到达终点).toBe(false);
  });
  it.each(Object.keys(templates))(
    "template %s validates and runs without a key",
    (id) => {
      const t = templates[id];
      expect(questionsSchema.safeParse(t.questions).success).toBe(true);
      expect(() =>
        parseAnswers({ answers: mockAnswers(t.questions) }, t.questions),
      ).not.toThrow();
      expect(
        validateExperiment("playground", t.state, t.questions).state,
      ).toEqual(t.state);
    },
  );
  it("dynamic answer parsing has no Tetris-only identifiers or fixed score range", () => {
    const q = {
      quality: {
        type: "score" as const,
        instructions: "test",
        criteria: ["low", "high"],
      },
      custom: {
        type: "choice" as const,
        instructions: "test",
        criteria: { a: "A", b: "B" },
      },
    };
    const answers = mockAnswers(q);
    expect(parseAnswers({ answers }, q).quality).toMatchObject({ score: 0.5 });
    expect(() =>
      parseAnswers(
        { answers: { ...answers, quality: { type: "score", score: 4 } } },
        q,
      ),
    ).toThrow("0～1");
    expect(() =>
      parseAnswers(
        {
          answers: {
            ...answers,
            custom: {
              type: "choice",
              choice: "z",
              probabilities: { a: 0.5, b: 0.5 },
            },
          },
        },
        q,
      ),
    ).toThrow("合法候选");
    expect(() =>
      parseAnswers(
        { answers: { ...answers, custom: { type: "noul", noul: 0.5 } } },
        q,
      ),
    ).toThrow("type");
  });
  it("reports precise input paths for malformed criteria", () => {
    const parsed = questionsSchema.safeParse({
      route: { type: "score", instructions: "choose", criteria: ["only one"] },
    });
    expect(parsed.success).toBe(false);
    if (!parsed.success)
      expect(parsed.error.issues[0].path).toEqual(["route", "criteria"]);
  });
  it("refuses unregistered experiments and cross-experiment state", () => {
    expect(() => validateExperiment("missing", {}, {})).toThrow();
    expect(() =>
      validateExperiment("pathfinding", templates.support.state, {}),
    ).toThrow();
  });
  it("every identity dimension independently invalidates a reply", () => {
    const a = {
      experimentId: "pathfinding",
      runId: "r",
      stepId: "s",
      stateVersion: 1,
      configVersion: 2,
      requestId: crypto.randomUUID(),
    };
    for (const k of Object.keys(a))
      expect(
        sameRunIdentity(a, {
          ...a,
          [k]: typeof a[k as keyof typeof a] === "number" ? 99 : "different",
        }),
      ).toBe(false);
  });
  it("export redaction preserves numerical usage while removing credentials recursively", () => {
    const out = redact(
      {
        apiKey: "secret-value",
        nested: {
          authorization: "Bearer abc",
          access_token: "abc",
          usage: {
            input_tokens: 17,
            output_tokens: 4,
            total_tokens: 21,
            cost: 0.001,
          },
          echo: "private-example",
        },
      },
      ["private-example"],
    ) as { nested: { usage: unknown } };
    expect(out.nested.usage).toEqual({
      input_tokens: 17,
      output_tokens: 4,
      total_tokens: 21,
      cost: 0.001,
    });
    expect(JSON.stringify(out)).not.toContain("secret-value");
    expect(JSON.stringify(out)).not.toContain("private-example");
    expect(JSON.stringify(out)).not.toContain("Bearer abc");
  });
  it("budget limits independent of display speed", () => {
    expect(budgetError(1, 0, { callLimit: 1, failureLimit: 3 })).toContain(
      "上限",
    );
    expect(budgetError(0, 3, { callLimit: 10, failureLimit: 3 })).toContain(
      "连续失败",
    );
  });
});
