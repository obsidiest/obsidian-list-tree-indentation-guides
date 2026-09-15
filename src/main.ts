import { Plugin } from "obsidian";
import { createEditorGuidesExtension } from "./editor-guides";
import { RenderedListGuides } from "./rendered-guides";
import { ListBreadcrumb } from "./list-breadcrumb";
import { createBreadcrumbEditorExtension } from "./breadcrumb-editor";
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
  private readonly renderedGuides = new RenderedListGuides(() => this.settings);
  private readonly breadcrumb = new ListBreadcrumb(this, this.renderedGuides);
  private styleSettingsPrecisionControls =
    new StyleSettingsPrecisionControls();

  public override async onload(): Promise<void> {
    await this.loadSettings();

    this.registerEditorExtension(createEditorGuidesExtension());
    this.registerEditorExtension(createBreadcrumbEditorExtension(this.breadcrumb));
    this.registerMarkdownPostProcessor((element, context) => {
      this.renderedGuides.process(element, context);
    });
    this.addSettingTab(
      new ListTreeIndentationGuidesSettingTab(this.app, this),
    );

    this.app.workspace.trigger("parse-style-settings");
    this.styleSettingsPrecisionControls.start(this.getOwnerDocuments());
    this.applyModeClassesToAllDocuments();
    this.refreshRenderedLists();
    this.observeDocuments(this.getOwnerDocuments());

    this.registerEvent(
      this.app.workspace.on("window-open", (_workspaceWindow, openedWindow) => {
        this.styleSettingsPrecisionControls.observeDocument(
          openedWindow.document,
        );
        this.applyModeClasses(openedWindow.document);
        this.renderedGuides.refresh(openedWindow.document);
        this.observeDocuments([
          openedWindow.document,
        ]);
      }),
    );
    this.registerEvent(
      this.app.workspace.on("window-close", (_workspaceWindow, closedWindow) => {
        this.breadcrumb.removeDocument(closedWindow.document);
        this.renderedGuides.removeDocument(closedWindow.document);
        this.styleSettingsPrecisionControls.removeDocument(closedWindow.document);
      }),
    );
    this.registerEvent(
      this.app.workspace.on("layout-change", () => {
        this.breadcrumb.refresh();
        this.styleSettingsPrecisionControls.start(this.getOwnerDocuments());
        this.applyModeClassesToAllDocuments();
        this.refreshRenderedLists();
        this.observeDocuments(
          this.getOwnerDocuments(),
        );
      }),
    );
    this.app.workspace.onLayoutReady(() => {
      this.applyModeClassesToAllDocuments();
      this.refreshRenderedLists();
      this.observeDocuments(this.getOwnerDocuments());
    });
    this.registerEvent(this.app.workspace.on("css-change", () => {
      this.refreshRenderedLists();
      this.breadcrumb.refresh();
    }));
    this.registerEvent(this.app.workspace.on("file-open", () => this.breadcrumb.refresh()));
  }

  public override onunload(): void {
    this.styleSettingsPrecisionControls.stop();
    this.breadcrumb.destroy();
    this.renderedGuides.destroy();
    for (const ownerDocument of this.getOwnerDocuments()) {
      for (const className of MODE_CLASSES) {
        ownerDocument.body.classList.remove(className);
      }
    }
  }

  public async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
    this.applyModeClassesToAllDocuments();
    this.refreshRenderedLists();
    this.breadcrumb.refresh();
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

  private refreshRenderedLists(): void {
    for (const ownerDocument of this.getOwnerDocuments()) {
      this.renderedGuides.refresh(ownerDocument);
    }
  }

  private observeDocuments(
    ownerDocuments: Iterable<Document>,
  ): void {
    for (const ownerDocument of ownerDocuments) {
      this.renderedGuides.observeDocument(ownerDocument);
      this.breadcrumb.observeDocument(ownerDocument);
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
