import { describe, expect, it } from "vitest";
import { Euler, Vector3 } from "three";
import {
  resonanceView,
  REFERENCE_END,
} from "../frontend/src/visual/resonanceChoreography";

function axisAt(time: number) {
  const view = resonanceView(time);
  return new Vector3(1, 0, 0).applyEuler(
    new Euler(view.pitch, view.yaw, view.roll, "ZYX"),
  );
}

describe("reference observation sequence", () => {
  it("keeps the axis extending toward the lower-right foreground from initial load onward", () => {
    for (const time of [0, 1, 2.5, 3.93, 5, 7.17, 30, 100, 1000]) {
      const axis = axisAt(time);
      expect(axis.x).toBeGreaterThan(0);
      expect(axis.y).toBeLessThan(0);
      expect(axis.z).toBeGreaterThan(0.9);
      expect(axis.angleTo(axisAt(0))).toBeLessThan(0.08);
    }
  });
  it("has no camera cut at the former transition or timeline boundary", () => {
    for (const time of [2, 3.93, REFERENCE_END])
      expect(axisAt(time - 0.001).angleTo(axisAt(time))).toBeLessThan(0.002);
  });
  it("remains a rigid transform throughout playback", () => {
    for (const time of [0, 2, 3.929, 3.93, 5, REFERENCE_END, 1000])
      expect(axisAt(time).length()).toBeCloseTo(1, 12);
  });
  it("continues the oblique shot after the reference ends without looping to the side view", () => {
    expect(
      axisAt(REFERENCE_END).angleTo(axisAt(REFERENCE_END + 0.001)),
    ).toBeLessThan(0.001);
    for (const time of [8, 30, 100]) expect(axisAt(time).y).toBeLessThan(0);
    expect(axisAt(8).angleTo(axisAt(10))).toBeGreaterThan(0.001);
  });
});
