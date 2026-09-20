import { describe, it, expect } from "vitest";
import { coreState } from "../frontend/src/components/SpatialLab";

describe("visual core uses observed lifecycle, never fabricated progress", () => {
  it.each(["请求模型", "请求模型（Mock）", "请求决策", "校验结果", "执行动作"])(
    "%s activates processing",
    (stage) => {
      expect(coreState(stage, undefined, true)).toBe("requesting");
    },
  );
  it("idle does not imply a result and pause retains an actual received result", () => {
    expect(coreState("已暂停")).toBe("idle");
    expect(coreState("已暂停", undefined, true)).toBe("complete");
  });
  it("errors remain visible even if a fallback has completed", () => {
    expect(coreState("完成落地", "Mock 模拟错误", true)).toBe("error");
  });
});
