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
      expect(styles).toContain(`id: ltig-thread-color-${depth}`);
      expect(styles).toContain(`--ltig-thread-color-${depth}`);
    }
  });

  it("uses the viewport overlay fix and mode-scoped threading", async () => {
    const editor = await readProjectFile("src/editor-guides.ts");
    const main = await readProjectFile("src/main.ts");
    const styles = await readProjectFile("styles.css");

    expect(editor).toContain("ownerDocument.body.appendChild(this.overlay)");
    expect(styles).toContain("position: fixed");
    expect(styles).toContain(
      "body.ltig-bullet-threading-enabled.ltig-thread-reading-mode-enabled",
    );
    for (const className of [
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
      "enableBulletThreading",
      "bulletThreadingInLivePreview",
      "bulletThreadingInSourceMode",
      "bulletThreadingInReadingMode",
    ]) {
      expect(settings).toContain(`key: "${key}"`);
    }
  });
});
