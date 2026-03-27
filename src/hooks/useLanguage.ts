export type Language = 'en';

export const useLanguage = () => {
  return {
    lang: 'en' as const,
    toggleLang: () => {},
    t: (_bn: string, en: string) => en
  };
};
