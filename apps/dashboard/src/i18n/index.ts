import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './locales/en.json';
import zhTW from './locales/zh-TW.json';

export const LANG_STORAGE_KEY = 'luminatick_lang';
export const SUPPORTED_LANGUAGES = ['en', 'zh-TW'] as const;
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

export function detectLanguage(): SupportedLanguage {
  try {
    const stored = localStorage.getItem(LANG_STORAGE_KEY);
    if (stored === 'en' || stored === 'zh-TW') return stored;
  } catch {
    // localStorage unavailable (e.g. tests, privacy mode) — fall through
  }
  const navLang = typeof navigator !== 'undefined' ? navigator.language.toLowerCase() : '';
  return navLang.startsWith('zh') ? 'zh-TW' : 'en';
}

i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    'zh-TW': { translation: zhTW },
  },
  lng: detectLanguage(),
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
  returnEmptyString: false,
});

if (typeof document !== 'undefined') {
  document.documentElement.lang = i18n.language;
}

export function persistLanguage(lang: string) {
  try {
    localStorage.setItem(LANG_STORAGE_KEY, lang);
  } catch {
    // ignore storage failures
  }
  document.documentElement.lang = lang;
}

export default i18n;