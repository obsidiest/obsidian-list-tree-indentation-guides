export interface ListTreeIndentationGuidesSettings {
  activeCursorListThreading: boolean;
  activeListItemThreading: boolean;
  activeOrphanListItemThreading: boolean;
  activeOrphanListThreading: boolean;
  allBranchesOfActiveListThreading: boolean;
  allBranchesOfActiveOrphanListThreading: boolean;
  enableListThreading: boolean;
  enableListStaticTreeIndentationGuides: boolean;
  listThreadingFromNonListHead: boolean;
  listThreadingInLivePreview: boolean;
  listThreadingInReadingMode: boolean;
  listThreadingInSourceMode: boolean;
  connectSeparateListBlocks: boolean;
  renderInLivePreview: boolean;
  renderInReadingMode: boolean;
  renderInSourceMode: boolean;
  threadBlankLineSeparatedListBlocksForActiveItem: boolean;
  threadBlankLineSeparatedListBlocksForAllBranches: boolean;
}

export const DEFAULT_SETTINGS: ListTreeIndentationGuidesSettings = {
  activeCursorListThreading: false,
  activeListItemThreading: true,
  activeOrphanListItemThreading: true,
  activeOrphanListThreading: true,
  allBranchesOfActiveListThreading: false,
  allBranchesOfActiveOrphanListThreading: false,
  enableListThreading: false,
  enableListStaticTreeIndentationGuides: true,
  listThreadingFromNonListHead: true,
  listThreadingInLivePreview: true,
  listThreadingInReadingMode: true,
  listThreadingInSourceMode: true,
  connectSeparateListBlocks: false,
  renderInLivePreview: true,
  renderInReadingMode: true,
  renderInSourceMode: true,
  threadBlankLineSeparatedListBlocksForActiveItem: false,
  threadBlankLineSeparatedListBlocksForAllBranches: false,
};

type PersistedSettings = Partial<ListTreeIndentationGuidesSettings> & {
  allBranchesOfActiveBulletListThreading?: boolean;
  bulletThreadingFromNonListHead?: boolean;
  bulletThreadingInLivePreview?: boolean;
  bulletThreadingInReadingMode?: boolean;
  bulletThreadingInSourceMode?: boolean;
  enableBulletThreading?: boolean;
  enableStaticListTreeIndentationGuides?: boolean;
  treatBlankLineSeparatedListBlocksAsOne?: boolean;
};

export function normalizeSettings(
  loaded: unknown,
): ListTreeIndentationGuidesSettings {
  const persisted = isRecord(loaded) ? (loaded as PersistedSettings) : {};
  return {
    activeCursorListThreading: readBoolean(
      persisted.activeCursorListThreading,
      DEFAULT_SETTINGS.activeCursorListThreading,
    ),
    activeListItemThreading: readBoolean(
      persisted.activeListItemThreading,
      DEFAULT_SETTINGS.activeListItemThreading,
    ),
    activeOrphanListItemThreading: readBoolean(
      persisted.activeOrphanListItemThreading,
      DEFAULT_SETTINGS.activeOrphanListItemThreading,
    ),
    activeOrphanListThreading: readBoolean(
      persisted.activeOrphanListThreading,
      DEFAULT_SETTINGS.activeOrphanListThreading,
    ),
    allBranchesOfActiveListThreading: readBoolean(
      persisted.allBranchesOfActiveListThreading,
      readBoolean(
        persisted.allBranchesOfActiveBulletListThreading,
        DEFAULT_SETTINGS.allBranchesOfActiveListThreading,
      ),
    ),
    allBranchesOfActiveOrphanListThreading: readBoolean(
      persisted.allBranchesOfActiveOrphanListThreading,
      DEFAULT_SETTINGS.allBranchesOfActiveOrphanListThreading,
    ),
    enableListThreading: readBoolean(
      persisted.enableListThreading,
      readBoolean(
        persisted.enableBulletThreading,
        DEFAULT_SETTINGS.enableListThreading,
      ),
    ),
    enableListStaticTreeIndentationGuides: readBoolean(
      persisted.enableListStaticTreeIndentationGuides,
      readBoolean(
        persisted.enableStaticListTreeIndentationGuides,
        DEFAULT_SETTINGS.enableListStaticTreeIndentationGuides,
      ),
    ),
    listThreadingFromNonListHead: readBoolean(
      persisted.listThreadingFromNonListHead,
      readBoolean(
        persisted.bulletThreadingFromNonListHead,
        DEFAULT_SETTINGS.listThreadingFromNonListHead,
      ),
    ),
    listThreadingInLivePreview: readBoolean(
      persisted.listThreadingInLivePreview,
      readBoolean(
        persisted.bulletThreadingInLivePreview,
        DEFAULT_SETTINGS.listThreadingInLivePreview,
      ),
    ),
    listThreadingInReadingMode: readBoolean(
      persisted.listThreadingInReadingMode,
      readBoolean(
        persisted.bulletThreadingInReadingMode,
        DEFAULT_SETTINGS.listThreadingInReadingMode,
      ),
    ),
    listThreadingInSourceMode: readBoolean(
      persisted.listThreadingInSourceMode,
      readBoolean(
        persisted.bulletThreadingInSourceMode,
        DEFAULT_SETTINGS.listThreadingInSourceMode,
      ),
    ),
    connectSeparateListBlocks: readBoolean(
      persisted.connectSeparateListBlocks,
      DEFAULT_SETTINGS.connectSeparateListBlocks,
    ),
    renderInLivePreview: readBoolean(
      persisted.renderInLivePreview,
      DEFAULT_SETTINGS.renderInLivePreview,
    ),
    renderInReadingMode: readBoolean(
      persisted.renderInReadingMode,
      DEFAULT_SETTINGS.renderInReadingMode,
    ),
    renderInSourceMode: readBoolean(
      persisted.renderInSourceMode,
      DEFAULT_SETTINGS.renderInSourceMode,
    ),
    threadBlankLineSeparatedListBlocksForActiveItem: readBoolean(
      persisted.threadBlankLineSeparatedListBlocksForActiveItem,
      DEFAULT_SETTINGS.threadBlankLineSeparatedListBlocksForActiveItem,
    ),
    threadBlankLineSeparatedListBlocksForAllBranches: readBoolean(
      persisted.threadBlankLineSeparatedListBlocksForAllBranches,
      readBoolean(
        persisted.treatBlankLineSeparatedListBlocksAsOne,
        DEFAULT_SETTINGS.threadBlankLineSeparatedListBlocksForAllBranches,
      ),
    ),
  };
}

function readBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
