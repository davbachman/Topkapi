'use client';
import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
} from 'react';
import french from '@/lib/i18n/fr.json';
type Locale = 'en' | 'fr';
const words: Record<string, string> = french;
const Context = createContext({
  locale: 'en' as Locale,
  setLocale: (_v: Locale) => {},
  t: (s: string) => s,
});
export function LocaleProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocale] = useState<Locale>('en');
  useEffect(() => {
    void Promise.resolve().then(() => {
      const saved = localStorage.getItem('taprats-locale');
      setLocale(
        saved === 'fr' || (!saved && navigator.language.startsWith('fr'))
          ? 'fr'
          : 'en',
      );
    });
  }, []);
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);
  const t = useCallback(
    (s: string) => {
      if (locale === 'en') return s;
      if (words[s]) return words[s];
      return s
        .replace(/^Download (.+)$/, 'Télécharger $1')
        .replace(/^Hide (.+)$/, 'Masquer $1')
        .replace(/^Show (.+)$/, 'Afficher $1')
        .replace(/^Unlock (.+)$/, 'Déverrouiller $1')
        .replace(/^Lock (.+)$/, 'Verrouiller $1')
        .replace(/^Shape (\d+)/, 'Forme $1')
        .replace(/(\d+) sides/, '$1 côtés')
        .replace(/^Copy (\d+)/, 'Copie $1')
        .replace(/, copy (\d+)/, ', copie $1')
        .replace(/^Vertex (\d+)/, 'Sommet $1')
        .replace(/^Edge (\d+)/, 'Côté $1')
        .replace(/^([uv]) vector · ([xy])$/, 'Vecteur $1 · $2');
    },
    [locale],
  );
  return (
    <Context.Provider
      value={{
        locale,
        t,
        setLocale: (v) => {
          localStorage.setItem('taprats-locale', v);
          setLocale(v);
        },
      }}
    >
      {children}
    </Context.Provider>
  );
}
export function useT() {
  return useContext(Context).t;
}
export function LanguageControl() {
  const { locale, setLocale } = useContext(Context);
  return (
    <select
      className="language-control"
      aria-label="Language / Langue"
      value={locale}
      onChange={(e) => setLocale(e.target.value as Locale)}
    >
      <option value="en">English</option>
      <option value="fr">Français</option>
    </select>
  );
}
