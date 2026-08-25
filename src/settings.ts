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
        heading: "Static List Tree Indentation Guides",
        items: [
          {
            name: "Enable static list tree indentation guides",
            desc: "Globally enable the always-visible list-tree spines and branch connectors.",
            aliases: [
              "static guides",
              "global rendering toggle",
              "tree indentation guides",
            ],
            control: {
              type: "toggle",
              key: "enableStaticListTreeIndentationGuides",
              defaultValue:
                DEFAULT_SETTINGS.enableStaticListTreeIndentationGuides,
            },
          },
          {
            name: "Rendering modes",
            desc: "Choose where static list-tree indentation guides are rendered.",
            aliases: ["view modes", "editor and reading modes"],
            render: (setting) => {
              setting.setHeading();
            },
          },
          {
            name: "Render in Live Preview",
            desc: "Show connected list-tree spines and branch connectors while editing in Live Preview.",
            aliases: ["live preview guides", "editor preview", "wysiwyg lists"],
            control: {
              type: "toggle",
              key: "renderInLivePreview",
              defaultValue: DEFAULT_SETTINGS.renderInLivePreview,
              disabled: () =>
                !this.host.settings.enableStaticListTreeIndentationGuides,
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
              disabled: () =>
                !this.host.settings.enableStaticListTreeIndentationGuides,
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
              disabled: () =>
                !this.host.settings.enableStaticListTreeIndentationGuides,
            },
          },
          {
            name: "Connect separate list blocks",
            desc: "Allow continuation or gutter spines to bridge non-list content between separate list blocks in Live Preview and Source mode.",
            aliases: [
              "gutter guide",
              "continuation spine",
              "bridge separate lists",
              "connect disconnected lists",
            ],
            control: {
              type: "toggle",
              key: "connectSeparateListBlocks",
              defaultValue: DEFAULT_SETTINGS.connectSeparateListBlocks,
              disabled: () =>
                !this.host.settings.enableStaticListTreeIndentationGuides,
            },
          },
        ],
      },
      {
        type: "group",
        heading: "Bullet threading",
        items: [
          {
            name: "Enable bullet threading",
            desc: "Enable Logseq-style hover highlighting for list-tree branches.",
            aliases: [
              "logseq list path",
              "active list item",
              "hover thread",
              "nested path highlight",
            ],
            control: {
              type: "toggle",
              key: "enableBulletThreading",
              defaultValue: DEFAULT_SETTINGS.enableBulletThreading,
            },
          },
          {
            name: "Active List Item Threading",
            desc: "Highlight the complete nested path to whichever list item is currently hovered over.",
            aliases: [
              "active bullet path",
              "hovered list item ancestors",
              "current item thread",
            ],
            control: {
              type: "toggle",
              key: "activeListItemThreading",
              defaultValue: DEFAULT_SETTINGS.activeListItemThreading,
              disabled: () => !this.host.settings.enableBulletThreading,
            },
          },
          {
            name: "All Branches of an Active List Threading",
            desc: "Highlight every nested branch in the same list block as the currently hovered list item.",
            aliases: [
              "whole list threading",
              "all active list branches",
              "entire bullet tree highlight",
              "all branches of an active bullet list threading",
            ],
            control: {
              type: "toggle",
              key: "allBranchesOfActiveBulletListThreading",
              defaultValue:
                DEFAULT_SETTINGS.allBranchesOfActiveBulletListThreading,
              disabled: () => !this.host.settings.enableBulletThreading,
            },
          },
          {
            name: "Treat separate list blocks that are separated only by a blank line",
            desc: "When all-branches threading is active, include adjacent list blocks separated only by blank lines in the highlighted tree.",
            aliases: [
              "merge blank line lists",
              "blank separated list threading",
              "join adjacent list blocks",
            ],
            control: {
              type: "toggle",
              key: "treatBlankLineSeparatedListBlocksAsOne",
              defaultValue:
                DEFAULT_SETTINGS.treatBlankLineSeparatedListBlocksAsOne,
              disabled: () =>
                !this.host.settings.enableBulletThreading ||
                !this.host.settings.allBranchesOfActiveBulletListThreading,
            },
          },
          {
            name: "Bullet threading from a non-bulleted/numbered list head",
            desc: "Treat the immediately preceding unmarked line as the visual head of an ordered or unordered list's threaded tree.",
            aliases: [
              "plain text list head",
              "unmarked list parent",
              "thread from non list heading",
            ],
            control: {
              type: "toggle",
              key: "bulletThreadingFromNonListHead",
              defaultValue: DEFAULT_SETTINGS.bulletThreadingFromNonListHead,
              disabled: () => !this.host.settings.enableBulletThreading,
            },
          },
          {
            name: "Thread in Live Preview",
            desc: "Show the active nested path while hovering list items in Live Preview when bullet threading is enabled.",
            aliases: ["live preview thread", "editor hover path"],
            control: {
              type: "toggle",
              key: "bulletThreadingInLivePreview",
              defaultValue: DEFAULT_SETTINGS.bulletThreadingInLivePreview,
              disabled: () => !this.host.settings.enableBulletThreading,
            },
          },
          {
            name: "Thread in Source mode",
            desc: "Show the active nested path while hovering list items in Source mode when bullet threading is enabled.",
            aliases: ["source thread", "raw markdown hover path"],
            control: {
              type: "toggle",
              key: "bulletThreadingInSourceMode",
              defaultValue: DEFAULT_SETTINGS.bulletThreadingInSourceMode,
              disabled: () => !this.host.settings.enableBulletThreading,
            },
          },
          {
            name: "Thread in Reading mode",
            desc: "Show the active nested path while hovering list items in Reading mode when bullet threading is enabled.",
            aliases: ["reading thread", "rendered list hover path"],
            control: {
              type: "toggle",
              key: "bulletThreadingInReadingMode",
              defaultValue: DEFAULT_SETTINGS.bulletThreadingInReadingMode,
              disabled: () => !this.host.settings.enableBulletThreading,
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
    this.update();
  }
}
