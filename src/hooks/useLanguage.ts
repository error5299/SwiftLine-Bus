import { useLanguageContext } from '../contexts/LanguageContext';

export type Language = 'bn' | 'en';

export const useLanguage = () => {
  return useLanguageContext();
};
