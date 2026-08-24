export interface ListTreeIndentationGuidesSettings {
  enableBulletThreading: boolean;
  bulletThreadingInLivePreview: boolean;
  bulletThreadingInReadingMode: boolean;
  bulletThreadingInSourceMode: boolean;
  renderInLivePreview: boolean;
  renderInReadingMode: boolean;
  renderInSourceMode: boolean;
}

export const DEFAULT_SETTINGS: ListTreeIndentationGuidesSettings = {
  enableBulletThreading: false,
  bulletThreadingInLivePreview: true,
  bulletThreadingInReadingMode: true,
  bulletThreadingInSourceMode: true,
  renderInLivePreview: true,
  renderInReadingMode: true,
  renderInSourceMode: true,
};
