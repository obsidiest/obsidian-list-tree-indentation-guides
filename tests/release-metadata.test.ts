import { describe, expect, it } from "vitest";

async function readProjectFile(path: string): Promise<string> {
  const { readFile } = await import("node:fs/promises");
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

describe("release metadata", () => {
  it("keeps every version source synchronized", async () => {
    const manifest = JSON.parse(await readProjectFile("manifest.json")) as {
      minAppVersion: string;
      version: string;
    };
    const packageJson = JSON.parse(await readProjectFile("package.json")) as {
      version: string;
    };
    const versions = JSON.parse(await readProjectFile("versions.json")) as Record<
      string,
      string
    >;
    const releaseRequest = JSON.parse(
      await readProjectFile(".github/release-request.json"),
    ) as { version: string };

    expect(packageJson.version).toBe(manifest.version);
    expect(releaseRequest.version).toBe(manifest.version);
    expect(versions[manifest.version]).toBe(manifest.minAppVersion);
  });

  it("attests and publishes all standard Obsidian release assets", async () => {
    const workflow = await readProjectFile(".github/workflows/release.yml");
    for (const asset of ["main.js", "manifest.json", "styles.css"]) {
      expect(workflow).toContain(asset);
    }
    expect(workflow).toContain("actions/attest@v4");
    expect(workflow).toContain("artifact-metadata: write");
    expect(workflow).toContain("attestations: write");
    expect(workflow).toContain("id-token: write");
  });

  it("declares every numerical visual control as a slider", async () => {
    const styles = await readProjectFile("styles.css");
    const sliderIds = [
      "ltig-guide-opacity",
      "ltig-guide-thickness",
      "ltig-guide-dash-length",
      "ltig-guide-dash-gap",
      "ltig-guide-dot-gap",
      "ltig-connector-length",
      "ltig-marker-gap",
      "ltig-first-branch-rise",
      "ltig-connector-offset",
      "ltig-reading-overlap",
      "ltig-reading-connector-center",
      "ltig-thread-opacity",
      "ltig-thread-thickness",
      "ltig-thread-corner-radius",
      "ltig-thread-connector-length",
      "ltig-thread-marker-gap",
      "ltig-thread-vertical-offset",
      "ltig-thread-reading-item-height",
      "ltig-thread-reading-segment-reach",
      "ltig-thread-reading-join-reach",
      "ltig-thread-reading-marker-y-shift",
    ];
    for (const id of sliderIds) {
      const settingStart = styles.indexOf(`id: ${id}`);
      expect(settingStart).toBeGreaterThanOrEqual(0);
      expect(styles.slice(settingStart, settingStart + 450)).toContain(
        "type: variable-number-slider",
      );
    }
  });

  it("defaults list markers to visible and exposes every thread color", async () => {
    const styles = await readProjectFile("styles.css");
    const markerSetting = styles.indexOf(
      "id: ltig-show-unordered-list-bullets",
    );
    expect(markerSetting).toBeGreaterThanOrEqual(0);
    expect(styles.slice(markerSetting, markerSetting + 400)).toContain(
      "default: true",
    );
    for (let depth = 1; depth <= 8; depth += 1) {
      const toggleSetting = styles.indexOf(
        `id: ltig-thread-color-${depth}-enabled`,
      );
      expect(toggleSetting).toBeGreaterThanOrEqual(0);
      expect(styles.slice(toggleSetting, toggleSetting + 350)).toContain(
        "type: class-toggle",
      );
      expect(styles.slice(toggleSetting, toggleSetting + 350)).toContain(
        "default: true",
      );
      expect(styles).toContain(`id: ltig-thread-color-${depth}`);
      expect(styles).toContain(`--ltig-thread-color-${depth}`);
      expect(styles).toContain(`--ltig-thread-effective-color-${depth}`);
    }
  });

  it("offers persistent fallback and override controls for every list-thread color", async () => {
    const styles = await readProjectFile("styles.css");
    const precisionControls = await readProjectFile(
      "src/style-settings-precision.ts",
    );
    const fallback = styles.indexOf("id: ltig-thread-fallback-colors-enabled");
    const override = styles.indexOf("id: ltig-thread-override-colors-enabled");

    expect(fallback).toBeGreaterThanOrEqual(0);
    expect(styles.slice(fallback, fallback + 350)).toContain("default: true");
    expect(override).toBeGreaterThanOrEqual(0);
    expect(styles.slice(override, override + 350)).toContain("default: false");
    for (const kind of ["fallback", "override"]) {
      for (const mode of ["light", "dark"]) {
        const id = `ltig-thread-${kind}-color-${mode}`;
        const setting = styles.indexOf(`id: ${id}`);
        expect(setting).toBeGreaterThanOrEqual(0);
        expect(styles.slice(setting, setting + 350)).toContain(
          "type: variable-text",
        );
        expect(styles).toContain(`--${id}`);
        expect(precisionControls).toContain(`["${id}",`);
      }
    }
    expect(precisionControls).toContain('colorInput.type = "color"');
    expect(precisionControls).toContain(
      'new EventConstructor("input", { bubbles: true })',
    );
    expect(styles).toContain(
      "--ltig-thread-override-color: var(--ltig-thread-override-color-dark)",
    );
    expect(styles).toContain(
      "--ltig-thread-override-color: var(--ltig-thread-override-color-light)",
    );
    expect(styles).toContain(
      "title: List Static Tree Indentation Guide Appearance",
    );
  });

  it("uses safe defaults for list separation and threading subfeatures", async () => {
    const types = await readProjectFile("src/types.ts");

    expect(types).toContain("activeListItemThreading: true");
    expect(types).toContain(
      "allBranchesOfActiveListThreading: false",
    );
    expect(types).toContain("activeOrphanListThreading: true");
    expect(types).toContain("activeOrphanListItemThreading: true");
    expect(types).toContain(
      "allBranchesOfActiveOrphanListThreading: false",
    );
    expect(types).toContain("connectSeparateListBlocks: false");
    expect(types).toContain("listThreadingFromNonListHead: true");
    expect(types).toContain("enableListStaticTreeIndentationGuides: true");
    expect(types).toContain(
      "threadBlankLineSeparatedListBlocksForActiveItem: false",
    );
    expect(types).toContain(
      "threadBlankLineSeparatedListBlocksForAllBranches: false",
    );
  });

  it("uses the visible-DOM editor overlay and mode-scoped threading", async () => {
    const editor = await readProjectFile("src/editor-guides.ts");
    const main = await readProjectFile("src/main.ts");
    const styles = await readProjectFile("styles.css");

    expect(editor).toContain("this.overlayHost.appendChild(this.overlay)");
    expect(editor).toContain('querySelectorAll<HTMLElement>(".cm-line")');
    expect(editor).toContain("findListRowAtClientY");
    expect(editor).toContain('boundaryBefore = "blank-line"');
    expect(editor).toContain("continuationEnd");
    expect(editor).toContain("listHeadRect");
    expect(editor).toContain("startsNewListBlock(currentRow");
    expect(editor).not.toContain('target.closest<HTMLElement>(".cm-line');
    expect(editor).not.toContain("syntaxTree");
    expect(styles).toContain("position: absolute");
    expect(styles).toContain(
      "body.ltig-list-threading-enabled.ltig-thread-reading-mode-enabled",
    );
    for (const className of [
      "ltig-thread-active-item-enabled",
      "ltig-thread-all-branches-enabled",
      "ltig-thread-active-blank-separated-blocks-enabled",
      "ltig-thread-all-branches-blank-separated-blocks-enabled",
      "ltig-thread-from-list-head-enabled",
      "ltig-thread-orphan-enabled",
      "ltig-thread-orphan-active-item-enabled",
      "ltig-thread-orphan-all-branches-enabled",
      "ltig-thread-live-preview-enabled",
      "ltig-thread-source-mode-enabled",
      "ltig-thread-reading-mode-enabled",
    ]) {
      expect(main).toContain(className);
    }
  });

  it("publishes every plugin setting through the searchable definition API", async () => {
    const settings = await readProjectFile("src/settings.ts");
    expect(settings).toContain("getSettingDefinitions()");
    for (const key of [
      "renderInLivePreview",
      "renderInSourceMode",
      "renderInReadingMode",
      "enableListStaticTreeIndentationGuides",
      "connectSeparateListBlocks",
      "enableListThreading",
      "activeListItemThreading",
      "threadBlankLineSeparatedListBlocksForActiveItem",
      "allBranchesOfActiveListThreading",
      "threadBlankLineSeparatedListBlocksForAllBranches",
      "listThreadingFromNonListHead",
      "activeOrphanListThreading",
      "activeOrphanListItemThreading",
      "allBranchesOfActiveOrphanListThreading",
      "listThreadingInLivePreview",
      "listThreadingInSourceMode",
      "listThreadingInReadingMode",
    ]) {
      expect(settings).toContain(`key: "${key}"`);
    }
    expect(settings).toContain(
      'heading: "List Static Tree Indentation Guides"',
    );
    expect(settings).toContain('heading: "List Threading"');
    expect(settings).toContain('name: "Rendering modes"');
    expect(settings).toContain(
      'name: "All Branches of an Active List Threading"',
    );
    expect(
      settings.match(
        /name: "Thread separate list blocks that are only separated by a blank line"/gu,
      ),
    ).toHaveLength(2);
  });
});
