import {
  App,
  Plugin,
  PluginSettingTab,
  type SettingDefinitionItem,
} from "obsidian";
import {
  DEFAULT_SETTINGS,
  type ListTreeIndentationGuidesSettings,
} from "./types";

export interface SettingsPluginHost extends Plugin {
  settings: ListTreeIndentationGuidesSettings;
  saveSettings(): Promise<void>;
}

type SettingsKey = keyof ListTreeIndentationGuidesSettings;

const SETTINGS_KEYS = new Set<string>(Object.keys(DEFAULT_SETTINGS));

export class ListTreeIndentationGuidesSettingTab extends PluginSettingTab {
  private readonly host: SettingsPluginHost;

  public constructor(app: App, plugin: SettingsPluginHost) {
    super(app, plugin);
    this.host = plugin;
  }

  public override getSettingDefinitions(): SettingDefinitionItem<SettingsKey>[] {
    return [
      {
        type: "group",
        heading: "Rendering modes",
        items: [
          {
            name: "Render in Live Preview",
            desc: "Show connected list-tree spines and branch connectors while editing in Live Preview.",
            aliases: ["live preview guides", "editor preview", "wysiwyg lists"],
            control: {
              type: "toggle",
              key: "renderInLivePreview",
              defaultValue: DEFAULT_SETTINGS.renderInLivePreview,
            },
          },
          {
            name: "Render in Source mode",
            desc: "Show connected list-tree spines and branch connectors alongside raw Markdown list syntax.",
            aliases: ["source guides", "markdown source", "raw editor lists"],
            control: {
              type: "toggle",
              key: "renderInSourceMode",
              defaultValue: DEFAULT_SETTINGS.renderInSourceMode,
            },
          },
          {
            name: "Render in Reading mode",
            desc: "Show connected list-tree spines and branch connectors in rendered Markdown.",
            aliases: ["reading view guides", "preview mode", "rendered lists"],
            control: {
              type: "toggle",
              key: "renderInReadingMode",
              defaultValue: DEFAULT_SETTINGS.renderInReadingMode,
            },
          },
        ],
      },
    ];
  }

  public override getControlValue(key: string): unknown {
    if (!SETTINGS_KEYS.has(key)) {
      return undefined;
    }
    return this.host.settings[key as SettingsKey];
  }

  public override async setControlValue(
    key: string,
    value: unknown,
  ): Promise<void> {
    if (!SETTINGS_KEYS.has(key) || typeof value !== "boolean") {
      return;
    }
    this.host.settings[key as SettingsKey] = value;
    await this.host.saveSettings();
  }
}
