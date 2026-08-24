export interface ListTreeIndentationGuidesSettings {
  activeListItemThreading: boolean;
  allBranchesOfActiveBulletListThreading: boolean;
  enableBulletThreading: boolean;
  bulletThreadingInLivePreview: boolean;
  bulletThreadingInReadingMode: boolean;
  bulletThreadingInSourceMode: boolean;
  connectSeparateListBlocks: boolean;
  renderInLivePreview: boolean;
  renderInReadingMode: boolean;
  renderInSourceMode: boolean;
}

export const DEFAULT_SETTINGS: ListTreeIndentationGuidesSettings = {
  activeListItemThreading: true,
  allBranchesOfActiveBulletListThreading: false,
  enableBulletThreading: false,
  bulletThreadingInLivePreview: true,
  bulletThreadingInReadingMode: true,
  bulletThreadingInSourceMode: true,
  connectSeparateListBlocks: false,
  renderInLivePreview: true,
  renderInReadingMode: true,
  renderInSourceMode: true,
};
