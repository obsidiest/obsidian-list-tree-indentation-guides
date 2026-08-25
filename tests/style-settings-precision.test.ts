import { describe, expect, it } from "vitest";
import {
  normalizeHexColor,
  parseCompleteInRangeNumber,
} from "src/style-settings-precision";

describe("Style Settings precise numeric inputs", () => {
  it("accepts arbitrary in-range decimals between slider ticks", () => {
    expect(parseCompleteInRangeNumber("1.37", "0.5", "6")).toBe("1.37");
    expect(parseCompleteInRangeNumber("-3.25", "-12", "12")).toBe(
      "-3.25",
    );
  });

  it("preserves the user's complete textual representation", () => {
    expect(parseCompleteInRangeNumber(" 01.500 ", "0", "6")).toBe(
      "01.500",
    );
  });

  it("rejects incomplete values only when a commit is attempted", () => {
    expect(parseCompleteInRangeNumber("1.", "0", "6")).toBeNull();
    expect(parseCompleteInRangeNumber("-", "-12", "12")).toBeNull();
    expect(parseCompleteInRangeNumber("", "0", "6")).toBeNull();
  });

  it("rejects out-of-range and non-finite values", () => {
    expect(parseCompleteInRangeNumber("7", "0", "6")).toBeNull();
    expect(parseCompleteInRangeNumber("Infinity", "0", "6")).toBeNull();
  });
});

describe("Style Settings persistent color inputs", () => {
  it("normalizes complete three- and six-digit hex colors", () => {
    expect(normalizeHexColor(" #AbC ")).toBe("#aabbcc");
    expect(normalizeHexColor("#12Af90")).toBe("#12af90");
  });

  it("rejects values a native color input cannot represent", () => {
    expect(normalizeHexColor("red")).toBeNull();
    expect(normalizeHexColor("#12345")).toBeNull();
    expect(normalizeHexColor("#11223344")).toBeNull();
  });
});
