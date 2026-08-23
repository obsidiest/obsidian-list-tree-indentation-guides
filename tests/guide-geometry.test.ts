import { describe, expect, it } from "vitest";
import { buildGuidePath, clamp, median } from "src/guide-geometry";

describe("guide geometry", () => {
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
