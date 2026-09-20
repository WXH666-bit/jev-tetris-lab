import { z } from "zod";
import { tetrisDefinition } from "./tetris.js";
import { pathDefinition } from "./pathfinding.js";
import { playgroundDefinition } from "./playground.js";
export { tetrisDefinition } from "./tetris.js";
export const experimentDefinitions = [
  tetrisDefinition,
  pathDefinition,
  playgroundDefinition,
];
export function validateExperiment(
  id: string,
  state: unknown,
  questions: unknown,
) {
  const definition = experimentDefinitions.find((d) => d.id === id);
  if (!definition)
    throw new z.ZodError([
      { code: "custom", path: ["experimentId"], message: "实验未注册" },
    ]);
  return definition.validateInput(state, questions);
}
