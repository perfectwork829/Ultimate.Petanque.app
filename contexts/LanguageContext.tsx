import React, { createContext, useState, useEffect, useCallback, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Language, t as translate, translations } from '@/constants/i18n/index';
import { extraTranslations } from '@/constants/i18nExtra';

const STORAGE_KEY = 'app_language';

export interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => Promise<void>;
  t: (section: string, key: string) => string;
}

export const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>('fr');

  useEffect(() => {
    const loadLanguage = async () => {
      try {
        const stored = await AsyncStorage.getItem(STORAGE_KEY);
        if (stored === 'en' || stored === 'fr') {
          setLanguageState(stored);
        }
      } catch {
        // Default to French
      }
    };
    loadLanguage();
  }, []);

  const setLanguage = useCallback(async (lang: Language) => {
    setLanguageState(lang);
    try {
      await AsyncStorage.setItem(STORAGE_KEY, lang);
    } catch {
      // Silent fail
    }
  }, []);

  const t = useCallback((section: string, key: string): string => {
    // Check extra translations first (overflow from main i18n)
    const extra = (extraTranslations as any)[section];
    if (extra && extra[key]) {
      return extra[key][language] || extra[key]['fr'] || key;
    }
    return translate(section, key, language);
  }, [language]);

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
}
