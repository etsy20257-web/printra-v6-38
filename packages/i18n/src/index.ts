export const supportedLocales = ['tr', 'en', 'es', 'de', 'fr', 'pt', 'ar', 'hi', 'ja', 'zh-CN', 'id', 'ko'] as const;
export type SupportedLocale = (typeof supportedLocales)[number];
