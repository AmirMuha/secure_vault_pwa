import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

import en from '../locales/en.json';
import ar from '../locales/ar.json';
import fa from '../locales/fa.json';

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      ar: { translation: ar },
      fa: { translation: fa }
    },
    fallbackLng: 'en',
    interpolation: {
      escapeValue: false // React already escapes by default
    }
  });

// Handle RTL direction on language change
i18n.on('languageChanged', (lng) => {
  if (lng.startsWith('ar') || lng.startsWith('fa')) {
    document.documentElement.dir = 'rtl';
    document.documentElement.lang = lng;
  } else {
    document.documentElement.dir = 'ltr';
    document.documentElement.lang = lng;
  }
});

// Run once on load to set initial direction and language
if (i18n.language) {
  document.documentElement.lang = i18n.language;
  if (i18n.language.startsWith('ar') || i18n.language.startsWith('fa')) {
    document.documentElement.dir = 'rtl';
  } else {
    document.documentElement.dir = 'ltr';
  }
}

export default i18n;
