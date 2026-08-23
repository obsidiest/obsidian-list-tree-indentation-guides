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
      "ltig-connector-length",
      "ltig-marker-gap",
      "ltig-first-branch-rise",
      "ltig-connector-offset",
      "ltig-reading-overlap",
    ];
    for (const id of sliderIds) {
      const settingStart = styles.indexOf(`id: ${id}`);
      expect(settingStart).toBeGreaterThanOrEqual(0);
      expect(styles.slice(settingStart, settingStart + 450)).toContain(
        "type: variable-number-slider",
      );
    }
  });
});
