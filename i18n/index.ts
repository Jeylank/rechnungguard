import { de } from './de';
import { en } from './en';

export const translations = {
  de,
  en,
} as const;

export type Language = keyof typeof translations;
export type Translation = typeof de;

export const defaultLanguage: Language = 'de';

export const isLanguage = (value: string | null): value is Language =>
  value === 'de' || value === 'en';
