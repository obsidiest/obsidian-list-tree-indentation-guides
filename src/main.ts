import { Plugin } from "obsidian";
import { createEditorGuidesExtension } from "./editor-guides";
import {
  decorateExistingReadingViews,
  decorateReadingLists,
  observeReadingThreadHover,
  removeReadingGuides,
} from "./reading-guides";
import { ListTreeIndentationGuidesSettingTab } from "./settings";
import { StyleSettingsPrecisionControls } from "./style-settings-precision";
import {
  DEFAULT_SETTINGS,
  normalizeSettings,
  type ListTreeIndentationGuidesSettings,
} from "./types";

const MODE_CLASSES = [
  "ltig-list-threading-enabled",
  "ltig-static-guides-enabled",
  "ltig-thread-active-cursor-enabled",
  "ltig-thread-active-item-enabled",
  "ltig-thread-all-branches-enabled",
  "ltig-thread-active-blank-separated-blocks-enabled",
  "ltig-thread-all-branches-blank-separated-blocks-enabled",
  "ltig-thread-from-list-head-enabled",
  "ltig-thread-orphan-enabled",
  "ltig-thread-orphan-active-item-enabled",
  "ltig-thread-orphan-all-branches-enabled",
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
  private readonly readingThreadHoverCleanups = new Map<
    Document,
    () => void
  >();
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
    this.observeReadingThreadHoverForDocuments(this.getOwnerDocuments());

    this.registerEvent(
      this.app.workspace.on("window-open", (_workspaceWindow, openedWindow) => {
        this.styleSettingsPrecisionControls.observeDocument(
          openedWindow.document,
        );
        this.applyModeClasses(openedWindow.document);
        decorateExistingReadingViews(openedWindow.document);
        this.observeReadingThreadHoverForDocuments([
          openedWindow.document,
        ]);
      }),
    );
    this.registerEvent(
      this.app.workspace.on("layout-change", () => {
        this.styleSettingsPrecisionControls.start(this.getOwnerDocuments());
        this.applyModeClassesToAllDocuments();
        this.decorateAllReadingViews();
        this.observeReadingThreadHoverForDocuments(
          this.getOwnerDocuments(),
        );
      }),
    );
    this.app.workspace.onLayoutReady(() => {
      this.applyModeClassesToAllDocuments();
      this.decorateAllReadingViews();
      this.observeReadingThreadHoverForDocuments(this.getOwnerDocuments());
    });
  }

  public override onunload(): void {
    this.styleSettingsPrecisionControls.stop();
    for (const cleanup of this.readingThreadHoverCleanups.values()) {
      cleanup();
    }
    this.readingThreadHoverCleanups.clear();
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
    this.settings = normalizeSettings(await this.loadData());
  }

  private applyModeClasses(ownerDocument: Document): void {
    ownerDocument.body.classList.toggle(
      "ltig-list-threading-enabled",
      this.settings.enableListThreading,
    );
    ownerDocument.body.classList.toggle(
      "ltig-static-guides-enabled",
      this.settings.enableListStaticTreeIndentationGuides,
    );
    ownerDocument.body.classList.toggle(
      "ltig-thread-active-cursor-enabled",
      this.settings.activeCursorListThreading,
    );
    ownerDocument.body.classList.toggle(
      "ltig-thread-active-item-enabled",
      this.settings.activeListItemThreading,
    );
    ownerDocument.body.classList.toggle(
      "ltig-thread-all-branches-enabled",
      this.settings.allBranchesOfActiveListThreading,
    );
    ownerDocument.body.classList.toggle(
      "ltig-thread-active-blank-separated-blocks-enabled",
      this.settings.threadBlankLineSeparatedListBlocksForActiveItem,
    );
    ownerDocument.body.classList.toggle(
      "ltig-thread-all-branches-blank-separated-blocks-enabled",
      this.settings.threadBlankLineSeparatedListBlocksForAllBranches,
    );
    ownerDocument.body.classList.toggle(
      "ltig-thread-from-list-head-enabled",
      this.settings.listThreadingFromNonListHead,
    );
    ownerDocument.body.classList.toggle(
      "ltig-thread-orphan-enabled",
      this.settings.activeOrphanListThreading,
    );
    ownerDocument.body.classList.toggle(
      "ltig-thread-orphan-active-item-enabled",
      this.settings.activeOrphanListItemThreading,
    );
    ownerDocument.body.classList.toggle(
      "ltig-thread-orphan-all-branches-enabled",
      this.settings.allBranchesOfActiveOrphanListThreading,
    );
    ownerDocument.body.classList.toggle(
      "ltig-thread-live-preview-enabled",
      this.settings.listThreadingInLivePreview,
    );
    ownerDocument.body.classList.toggle(
      "ltig-thread-source-mode-enabled",
      this.settings.listThreadingInSourceMode,
    );
    ownerDocument.body.classList.toggle(
      "ltig-thread-reading-mode-enabled",
      this.settings.listThreadingInReadingMode,
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

  private observeReadingThreadHoverForDocuments(
    ownerDocuments: Iterable<Document>,
  ): void {
    for (const ownerDocument of ownerDocuments) {
      if (this.readingThreadHoverCleanups.has(ownerDocument)) {
        continue;
      }
      this.readingThreadHoverCleanups.set(
        ownerDocument,
        observeReadingThreadHover(ownerDocument),
      );
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
