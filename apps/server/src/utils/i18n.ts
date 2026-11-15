export const DEFAULT_LOCALE = 'en';
export const SUPPORTED_LOCALES = ['en', 'zh-TW'] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];

/**
 * Resolve a locale from an arbitrary request hint (e.g. body.locale or
 * the Accept-Language header). Falls back to DEFAULT_LOCALE.
 */
export function resolveLocale(requested?: string | null): Locale {
  const lang = (requested || '').toLowerCase();
  if (lang.startsWith('zh')) return 'zh-TW';
  return DEFAULT_LOCALE;
}

export interface EmailBody {
  html: string;
  text: string;
}

export const emailTemplates: Record<
  Locale,
  {
    magicLinkSubject: string;
    magicLinkBody: (url: string) => EmailBody;
    otpSubject: string;
    otpBody: (otp: string) => EmailBody;
  }
> = {
  en: {
    magicLinkSubject: 'Your Login Link',
    magicLinkBody: (url: string) => ({
      html: `<p>Hello,</p><p>Click the link below to log in to your portal:</p><p><a href="${url}">${url}</a></p><p>This link expires in 15 minutes.</p>`,
      text: `Hello,\n\nClick the link below to log in to your portal:\n${url}\n\nThis link expires in 15 minutes.`,
    }),
    otpSubject: 'Your Login Code',
    otpBody: (otp: string) => ({
      html: `<p>Hello,</p><p>Your login code is: <strong>${otp}</strong></p><p>This code expires in 15 minutes.</p>`,
      text: `Hello,\n\nYour login code is: ${otp}\n\nThis code expires in 15 minutes.`,
    }),
  },
  'zh-TW': {
    magicLinkSubject: '您的登入連結',
    magicLinkBody: (url: string) => ({
      html: `<p>您好，</p><p>請點擊下方連結登入您的客服中心：</p><p><a href="${url}">${url}</a></p><p>此連結將於 15 分鐘後失效。</p>`,
      text: `您好，\n\n請點擊下方連結登入您的客服中心：\n${url}\n\n此連結將於 15 分鐘後失效。`,
    }),
    otpSubject: '您的登入驗證碼',
    otpBody: (otp: string) => ({
      html: `<p>您好，</p><p>您的登入驗證碼為：<strong>${otp}</strong></p><p>此驗證碼將於 15 分鐘後失效。</p>`,
      text: `您好，\n\n您的登入驗證碼為：${otp}\n\n此驗證碼將於 15 分鐘後失效。`,
    }),
  },
};