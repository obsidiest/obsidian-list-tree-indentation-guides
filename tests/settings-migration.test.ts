import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, normalizeSettings } from "src/types";

describe("plugin settings normalization", () => {
  it("supplies the safe defaults for new list-threading controls", () => {
    expect(normalizeSettings(undefined)).toEqual(DEFAULT_SETTINGS);
    expect(DEFAULT_SETTINGS).toMatchObject({
      activeCursorListThreading: false,
      activeListItemThreading: true,
      activeOrphanListItemThreading: true,
      activeOrphanListThreading: true,
      allBranchesOfActiveListThreading: false,
      allBranchesOfActiveOrphanListThreading: false,
      enableListThreading: false,
      threadBlankLineSeparatedListBlocksForActiveItem: false,
      threadBlankLineSeparatedListBlocksForAllBranches: false,
    });
  });

  it("migrates the released 1.0.5 setting keys without losing choices", () => {
    expect(
      normalizeSettings({
        allBranchesOfActiveBulletListThreading: true,
        bulletThreadingFromNonListHead: false,
        bulletThreadingInLivePreview: false,
        bulletThreadingInReadingMode: false,
        bulletThreadingInSourceMode: false,
        enableBulletThreading: true,
        enableStaticListTreeIndentationGuides: false,
        treatBlankLineSeparatedListBlocksAsOne: true,
      }),
    ).toMatchObject({
      allBranchesOfActiveListThreading: true,
      enableListStaticTreeIndentationGuides: false,
      enableListThreading: true,
      listThreadingFromNonListHead: false,
      listThreadingInLivePreview: false,
      listThreadingInReadingMode: false,
      listThreadingInSourceMode: false,
      threadBlankLineSeparatedListBlocksForAllBranches: true,
    });
  });

  it("prefers current keys when current and legacy values coexist", () => {
    expect(
      normalizeSettings({
        enableBulletThreading: true,
        enableListThreading: false,
      }).enableListThreading,
    ).toBe(false);
  });
});
