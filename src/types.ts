export interface ListTreeIndentationGuidesSettings {
  activeListItemThreading: boolean;
  allBranchesOfActiveBulletListThreading: boolean;
  bulletThreadingFromNonListHead: boolean;
  enableBulletThreading: boolean;
  enableStaticListTreeIndentationGuides: boolean;
  bulletThreadingInLivePreview: boolean;
  bulletThreadingInReadingMode: boolean;
  bulletThreadingInSourceMode: boolean;
  connectSeparateListBlocks: boolean;
  renderInLivePreview: boolean;
  renderInReadingMode: boolean;
  renderInSourceMode: boolean;
  treatBlankLineSeparatedListBlocksAsOne: boolean;
}

export const DEFAULT_SETTINGS: ListTreeIndentationGuidesSettings = {
  activeListItemThreading: true,
  allBranchesOfActiveBulletListThreading: false,
  bulletThreadingFromNonListHead: true,
  enableBulletThreading: false,
  enableStaticListTreeIndentationGuides: true,
  bulletThreadingInLivePreview: true,
  bulletThreadingInReadingMode: true,
  bulletThreadingInSourceMode: true,
  connectSeparateListBlocks: false,
  renderInLivePreview: true,
  renderInReadingMode: true,
  renderInSourceMode: true,
  treatBlankLineSeparatedListBlocksAsOne: false,
};
