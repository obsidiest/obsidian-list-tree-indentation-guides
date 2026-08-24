import { Plugin } from "obsidian";
import { createEditorGuidesExtension } from "./editor-guides";
import {
  decorateExistingReadingViews,
  decorateReadingLists,
  removeReadingGuides,
} from "./reading-guides";
import { ListTreeIndentationGuidesSettingTab } from "./settings";
import { StyleSettingsPrecisionControls } from "./style-settings-precision";
import {
  DEFAULT_SETTINGS,
  type ListTreeIndentationGuidesSettings,
} from "./types";

const MODE_CLASSES = [
  "ltig-bullet-threading-enabled",
  "ltig-thread-active-item-enabled",
  "ltig-thread-all-branches-enabled",
  "ltig-thread-live-preview-enabled",
  "ltig-thread-reading-mode-enabled",
  "ltig-thread-source-mode-enabled",
  "ltig-connect-separate-list-blocks-enabled",
  "ltig-live-preview-enabled",
  "ltig-reading-mode-enabled",
  "ltig-source-mode-enabled",
] as const;

export default class ListTreeIndentationGuidesPlugin extends Plugin {
  public settings: ListTreeIndentationGuidesSettings = { ...DEFAULT_SETTINGS };
  private styleSettingsPrecisionControls =
    new StyleSettingsPrecisionControls();

  public override async onload(): Promise<void> {
    await this.loadSettings();

    this.registerEditorExtension(createEditorGuidesExtension());
    this.registerMarkdownPostProcessor((element) => {
      decorateReadingLists(element);
    });
    this.addSettingTab(
      new ListTreeIndentationGuidesSettingTab(this.app, this),
    );

    this.app.workspace.trigger("parse-style-settings");
    this.styleSettingsPrecisionControls.start(this.getOwnerDocuments());
    this.applyModeClassesToAllDocuments();
    this.decorateAllReadingViews();

    this.registerEvent(
      this.app.workspace.on("window-open", (_workspaceWindow, openedWindow) => {
        this.styleSettingsPrecisionControls.observeDocument(
          openedWindow.document,
        );
        this.applyModeClasses(openedWindow.document);
        decorateExistingReadingViews(openedWindow.document);
      }),
    );
    this.registerEvent(
      this.app.workspace.on("layout-change", () => {
        this.styleSettingsPrecisionControls.start(this.getOwnerDocuments());
        this.applyModeClassesToAllDocuments();
        this.decorateAllReadingViews();
      }),
    );
    this.app.workspace.onLayoutReady(() => {
      this.applyModeClassesToAllDocuments();
      this.decorateAllReadingViews();
    });
  }

  public override onunload(): void {
    this.styleSettingsPrecisionControls.stop();
    for (const ownerDocument of this.getOwnerDocuments()) {
      removeReadingGuides(ownerDocument);
      for (const className of MODE_CLASSES) {
        ownerDocument.body.classList.remove(className);
      }
    }
  }

  public async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
    this.applyModeClassesToAllDocuments();
    this.decorateAllReadingViews();
  }

  private async loadSettings(): Promise<void> {
    const loaded = (await this.loadData()) as
      | Partial<ListTreeIndentationGuidesSettings>
      | null;
    this.settings = {
      ...DEFAULT_SETTINGS,
      ...(loaded ?? {}),
    };
  }

  private applyModeClasses(ownerDocument: Document): void {
    ownerDocument.body.classList.toggle(
      "ltig-bullet-threading-enabled",
      this.settings.enableBulletThreading,
    );
    ownerDocument.body.classList.toggle(
      "ltig-thread-active-item-enabled",
      this.settings.activeListItemThreading,
    );
    ownerDocument.body.classList.toggle(
      "ltig-thread-all-branches-enabled",
      this.settings.allBranchesOfActiveBulletListThreading,
    );
    ownerDocument.body.classList.toggle(
      "ltig-thread-live-preview-enabled",
      this.settings.bulletThreadingInLivePreview,
    );
    ownerDocument.body.classList.toggle(
      "ltig-thread-source-mode-enabled",
      this.settings.bulletThreadingInSourceMode,
    );
    ownerDocument.body.classList.toggle(
      "ltig-thread-reading-mode-enabled",
      this.settings.bulletThreadingInReadingMode,
    );
    ownerDocument.body.classList.toggle(
      "ltig-connect-separate-list-blocks-enabled",
      this.settings.connectSeparateListBlocks,
    );
    ownerDocument.body.classList.toggle(
      "ltig-live-preview-enabled",
      this.settings.renderInLivePreview,
    );
    ownerDocument.body.classList.toggle(
      "ltig-source-mode-enabled",
      this.settings.renderInSourceMode,
    );
    ownerDocument.body.classList.toggle(
      "ltig-reading-mode-enabled",
      this.settings.renderInReadingMode,
    );
  }

  private applyModeClassesToAllDocuments(): void {
    for (const ownerDocument of this.getOwnerDocuments()) {
      this.applyModeClasses(ownerDocument);
    }
  }

  private decorateAllReadingViews(): void {
    for (const ownerDocument of this.getOwnerDocuments()) {
      decorateExistingReadingViews(ownerDocument);
    }
  }

  private getOwnerDocuments(): Set<Document> {
    const ownerDocuments = new Set<Document>();
    if (typeof document !== "undefined") {
      ownerDocuments.add(document);
    }
    this.app.workspace.iterateAllLeaves((leaf) => {
      const ownerDocument = leaf.view.containerEl?.ownerDocument;
      if (ownerDocument !== undefined) {
        ownerDocuments.add(ownerDocument);
      }
    });
    return ownerDocuments;
  }
}
