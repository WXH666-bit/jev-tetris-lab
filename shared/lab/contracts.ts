import { z } from "zod";
export type Json =
  null | boolean | number | string | Json[] | { [key: string]: Json };
export const jsonSchema: z.ZodType<Json> = z.lazy(() =>
  z.union([
    z.null(),
    z.boolean(),
    z.number().finite(),
    z.string(),
    z.array(jsonSchema),
    z.record(jsonSchema),
  ]),
);
const description = z.string().min(1).max(10000);
export const questionSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("choice"),
    instructions: description,
    criteria: z
      .record(description)
      .refine(
        (v) => Object.keys(v).length > 0 && Object.keys(v).length <= 255,
        "choice 需要 1～255 个非空候选",
      ),
  }),
  z.object({
    type: z.literal("noul"),
    instructions: description,
    criteria: z.object({ true: description, false: description }).optional(),
  }),
  z.object({
    type: z.literal("score"),
    instructions: description,
    criteria: z.array(description).min(2).max(10),
  }),
]);
export const questionsSchema = z
  .record(questionSchema)
  .superRefine((v, ctx) => {
    if (!Object.keys(v).length || Object.keys(v).length > 32)
      ctx.addIssue({ code: "custom", message: "需要 1～32 个问题" });
    for (const k of Object.keys(v))
      if (!/^[a-zA-Z][a-zA-Z0-9_]{0,63}$/.test(k))
        ctx.addIssue({
          code: "custom",
          path: [k],
          message: "问题 ID 必须为字母开头的字母、数字、下划线",
        });
  });
export type Question = z.infer<typeof questionSchema>;
export type Questions = z.infer<typeof questionsSchema>;
export type Answer =
  | {
      type: "choice";
      choice: string;
      probabilities?: Record<string, number>;
      confidence?: number;
    }
  | { type: "noul"; noul: number }
  | {
      type: "score";
      score: number;
      probabilities?: Record<string, number>;
      confidence?: number;
    };
const probability = z.number().finite().min(0).max(1);
const distribution = z
  .record(probability)
  .refine(
    (p) =>
      Object.keys(p).length > 0 &&
      Math.abs(Object.values(p).reduce((a, b) => a + b, 0) - 1) <= 0.001,
    "概率和必须在 1±0.001 内",
  );
const answerSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("choice"),
    choice: z.string(),
    probabilities: distribution,
    confidence: probability.optional(),
  }),
  z.object({ type: z.literal("noul"), noul: probability }),
  z.object({
    type: z.literal("score"),
    score: z.number().finite(),
    probabilities: distribution.optional(),
    confidence: probability.optional(),
  }),
]);
export function parseAnswers(
  raw: unknown,
  questions: Questions,
): Record<string, Answer> {
  const root = z.object({ answers: z.record(z.unknown()) }).parse(raw);
  const result: Record<string, Answer> = {};
  for (const [id, q] of Object.entries(questions)) {
    const parsed = answerSchema.safeParse(root.answers[id]);
    if (!parsed.success)
      throw Error(
        `answers.${id}: ${parsed.error.issues.map((i) => i.path.join(".") + ": " + i.message).join("; ")}`,
      );
    const a = parsed.data;
    if (a.type !== q.type) throw Error(`answers.${id}.type: 应为 ${q.type}`);
    if (q.type === "choice" && a.type === "choice") {
      const ids = Object.keys(q.criteria);
      if (!ids.includes(a.choice))
        throw Error(`answers.${id}.choice: 不在合法候选中`);
      if (
        ids.length !== Object.keys(a.probabilities).length ||
        ids.some((k) => !(k in a.probabilities))
      )
        throw Error(`answers.${id}.probabilities: 候选集合不匹配`);
    }
    if (q.type === "score" && a.type === "score") {
      const max = q.criteria.length - 1;
      if (a.score < 0 || a.score > max)
        throw Error(`answers.${id}.score: 范围应为 0～${max}`);
      if (
        a.probabilities &&
        (Object.keys(a.probabilities).length !== q.criteria.length ||
          q.criteria.some((_, i) => !(String(i) in a.probabilities!)))
      )
        throw Error(`answers.${id}.probabilities: 评分级别不匹配`);
    }
    result[id] = a;
  }
  return result;
}
export function mockAnswers(questions: Questions): Record<string, Answer> {
  return Object.fromEntries(
    Object.entries(questions).map(([id, q]) => {
      if (q.type === "choice") {
        const ids = Object.keys(q.criteria);
        return [
          id,
          {
            type: "choice",
            choice: ids[0],
            probabilities: Object.fromEntries(
              ids.map((k, i) => [
                k,
                ids.length === 1 ? 1 : i === 0 ? 0.7 : 0.3 / (ids.length - 1),
              ]),
            ),
          },
        ];
      }
      if (q.type === "noul") return [id, { type: "noul", noul: 0.5 }];
      return [id, { type: "score", score: (q.criteria.length - 1) / 2 }];
    }),
  );
}
export const runIdentitySchema = z.object({
  experimentId: z.string().min(1),
  runId: z.string().min(1).max(100),
  stepId: z.string().min(1).max(150),
  stateVersion: z.number().int().nonnegative(),
  configVersion: z.number().int().nonnegative(),
  requestId: z.string().uuid(),
});
export type RunIdentity = z.infer<typeof runIdentitySchema>;
export function sameRunIdentity(a: RunIdentity, b: RunIdentity) {
  return Object.keys(runIdentitySchema.shape).every(
    (k) => a[k as keyof RunIdentity] === b[k as keyof RunIdentity],
  );
}
export type LabResult = {
  answers: Record<string, Answer>;
  raw: unknown;
  source:
    "Jev / 真实模型" | "Mock 模拟" | "本地策略" | "错误后兜底" | "手动操作";
  latencyMs: number;
  status?: number;
  attempts?: number;
};
export function inputErrors(error: unknown) {
  return error instanceof z.ZodError
    ? error.issues
        .map((i) => `${i.path.join(".") || "$"}: ${i.message}`)
        .join("\n")
    : error instanceof Error
      ? error.message
      : "格式错误";
}
