import { describe, expect, it } from "vitest";
import { buildGuidePath, clamp, median, threadStartY } from "src/guide-geometry";

describe("guide geometry", () => {
  it("keeps the round/square stroke cap below the parent marker at full height", () => {
    for (const thickness of [0.5, 4, 12]) {
      const start = threadStartY(26, 90, 100, thickness, 4);
      expect(start - thickness / 2).toBe(30);
      expect(threadStartY(26, 90, 50, thickness, 4)).toBe((90 + start) / 2);
      expect(threadStartY(26, 90, 0, thickness, 4)).toBe(90);
    }
    expect(threadStartY(100, 90, 100, 4, 4)).toBe(90);
  });
  it("allows intentional reach above the safe default without a 100% cap", () => {
    expect(threadStartY(26, 90, 150, 4, 4)).toBe(3);
    expect(threadStartY(26, 90, 1000, 4, 4)).toBe(-490);
    expect(threadStartY(26, 90, -10, 4, 4)).toBe(90);
    expect(threadStartY(26, 90, Number.NaN, 4, 4)).toBe(32);
  });
  it("builds one continuous spine with a connector for every sibling", () => {
    expect(
      buildGuidePath({
        connectors: [
          { endX: 30, y: 20 },
          { endX: 30, y: 40 },
          { endX: 30, y: 60 },
        ],
        endY: 60,
        spineX: 12,
        startY: 10,
      }),
    ).toBe(
      "M 12 10 V 60 M 12 20 H 30 M 12 40 H 30 M 12 60 H 30",
    );
  });

  it("uses the median connector origin to keep sibling spines aligned", () => {
    expect(median([12, 13, 100, 14, 11])).toBe(13);
    expect(median([10, 12])).toBe(11);
    expect(median([])).toBeNull();
  });

  it("clamps paths to the visible editor viewport", () => {
    expect(clamp(-5, 0, 100)).toBe(0);
    expect(clamp(40, 0, 100)).toBe(40);
    expect(clamp(105, 0, 100)).toBe(100);
  });
});
