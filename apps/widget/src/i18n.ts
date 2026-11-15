export type WidgetLang = 'en' | 'zh-TW';

function detectLang(): WidgetLang {
  try {
    const stored = localStorage.getItem('luminatick_lang');
    if (stored === 'en' || stored === 'zh-TW') return stored;
  } catch {
    // localStorage unavailable — fall through
  }
  const navLang = typeof navigator !== 'undefined' ? navigator.language.toLowerCase() : '';
  return navLang.startsWith('zh') ? 'zh-TW' : 'en';
}

export const lang: WidgetLang = detectLang();

const en = {
  fallbackTitle: 'How can we help?',
  aiChat: 'AI Chat',
  newTicket: 'New Ticket',
  poweredBy: 'Powered by Luminatick',
  aiWelcome: "Hello! I'm here to help you. What's on your mind?",
  aiError: "I'm sorry, I'm having trouble connecting right now. Please try again or submit a ticket.",
  typeQuestion: 'Type your question...',
  successTitle: 'Ticket Submitted!',
  successMessage: "We've received your request and will get back to you soon.",
  submitAnother: 'Submit another ticket',
  yourName: 'Your Name',
  emailAddress: 'Email Address',
  subject: 'Subject',
  subjectPlaceholder: 'How can we help?',
  message: 'Message',
  messagePlaceholder: 'Tell us more about your issue...',
  somethingWrong: 'Something went wrong. Please try again.',
  submitting: 'Submitting...',
  send: 'Send Message',
};

const zhTW: typeof en = {
  fallbackTitle: '您需要什麼協助？',
  aiChat: 'AI 聊天',
  newTicket: '新增工單',
  poweredBy: 'Powered by Luminatick',
  aiWelcome: '您好！我在這裡為您服務。請告訴我您遇到的問題。',
  aiError: '很抱歉，目前連線異常。請稍後再試，或改為提交工單。',
  typeQuestion: '請輸入您的問題...',
  successTitle: '工單已送出！',
  successMessage: '我們已收到您的請求，將盡快與您聯繫。',
  submitAnother: '再提交一筆工單',
  yourName: '您的姓名',
  emailAddress: '電子郵件地址',
  subject: '主旨',
  subjectPlaceholder: '您需要什麼協助？',
  message: '內容',
  messagePlaceholder: '請詳細描述您的問題...',
  somethingWrong: '發生錯誤，請再試一次。',
  submitting: '送出中...',
  send: '傳送訊息',
};

const dictionaries = { en, 'zh-TW': zhTW } as const;

export type WidgetDictKey = keyof typeof en;

export function t(key: WidgetDictKey): string {
  return dictionaries[lang][key] ?? en[key];
}