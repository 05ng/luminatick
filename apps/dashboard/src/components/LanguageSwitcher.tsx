import { useTranslation } from 'react-i18next';
import { Languages } from 'lucide-react';
import { persistLanguage } from '../i18n';

export function LanguageSwitcher({ variant = 'light' }: { variant?: 'light' | 'dark' }) {
  const { i18n } = useTranslation();
  const current = i18n.language.startsWith('zh') ? 'zh-TW' : 'en';

  const handleChange = (lang: string) => {
    i18n.changeLanguage(lang);
    persistLanguage(lang);
  };

  const isDark = variant === 'dark';

  return (
    <div className="flex items-center gap-1 rounded-full border border-slate-200 bg-slate-100 p-0.5">
      <button
        onClick={() => handleChange('en')}
        className={
          'px-2 py-0.5 rounded-full text-xs font-semibold transition-colors ' +
          (current === 'en'
            ? 'bg-white text-slate-900 shadow-sm'
            : isDark
              ? 'text-slate-400 hover:text-white'
              : 'text-slate-500 hover:text-slate-900')
        }
        aria-label="English"
      >
        EN
      </button>
      <button
        onClick={() => handleChange('zh-TW')}
        className={
          'px-2 py-0.5 rounded-full text-xs font-semibold transition-colors ' +
          (current === 'zh-TW'
            ? 'bg-white text-slate-900 shadow-sm'
            : isDark
              ? 'text-slate-400 hover:text-white'
              : 'text-slate-500 hover:text-slate-900')
        }
        aria-label="繁體中文"
      >
        中
      </button>
      <Languages className="hidden w-3.5 h-3.5 text-slate-400 mr-1 sm:block" />
    </div>
  );
}