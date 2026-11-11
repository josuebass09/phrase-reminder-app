/** The app's two sections. */
export type Tab = 'phrases' | 'chat'

/** Ids that tie each tab to its panel, for screen readers. */
export const tabId = (tab: Tab) => `tab-${tab}`
export const panelId = (tab: Tab) => `panel-${tab}`
