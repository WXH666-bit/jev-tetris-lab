import { stateSchema } from "../schemas.js";
import { questions } from "../decisions.js";
export const tetrisDefinition = {
  id: "tetris",
  name: "俄罗斯方块实验",
  english: "Tetris Lab",
  version: "1.0.0",
  description: "保留可达落点搜索与动作路径，观察消行收益、空间布局和后续风险。",
  ability: "空间布局 · 短期收益 · 后续风险",
  modes: ["mock", "local", "real", "manual"] as const,
  kind: "turn" as const,
  baselineVersion: "heuristic-v1",
  validateInput(state: unknown, _questions: unknown) {
    const parsed = stateSchema.parse(state);
    return { state: parsed, questions: questions(parsed) };
  },
};
