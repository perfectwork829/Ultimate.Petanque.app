import { useContext } from 'react';
import { LanguageContext, LanguageContextType } from '@/contexts/LanguageContext';

export function useLanguage(): LanguageContextType {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useLanguage must be used within LanguageProvider');
  }
  return context;
}
