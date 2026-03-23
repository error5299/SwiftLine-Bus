import { useLanguage } from '../hooks/useLanguage';
import { Languages } from 'lucide-react';

export const LanguageToggle = () => {
  const { lang, toggleLang } = useLanguage();

  return (
    <button
      onClick={toggleLang}
      className="flex items-center gap-2 px-3 py-1.5 rounded-full border border-slate-200 hover:bg-slate-50 transition-colors text-sm font-medium"
    >
      <Languages size={16} />
      <span>{lang === 'bn' ? 'English' : 'বাংলা'}</span>
    </button>
  );
};
