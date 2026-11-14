// The languages a new worker can be set to. Owl speaks and shows instructions in the worker's own language.

export interface LanguageOption {
  code: string
  /** The name in the language itself, which is how its speakers look for it. */
  native: string
  english: string
  /** The locale used for speech in the browser (dictation and "Hear it"). */
  speech: string
}

export const LANGUAGES: LanguageOption[] = [
  { code: 'en', native: 'English', english: 'English', speech: 'en-US' },
  { code: 'fi', native: 'Suomi', english: 'Finnish', speech: 'fi-FI' },
  { code: 'sv', native: 'Svenska', english: 'Swedish', speech: 'sv-SE' },
  { code: 'et', native: 'Eesti', english: 'Estonian', speech: 'et-EE' },
  { code: 'uk', native: 'Українська', english: 'Ukrainian', speech: 'uk-UA' },
  { code: 'ru', native: 'Русский', english: 'Russian', speech: 'ru-RU' },
  { code: 'ar', native: 'العربية', english: 'Arabic', speech: 'ar-SA' },
  { code: 'so', native: 'Soomaali', english: 'Somali', speech: 'so-SO' },
]

/** Owl writes the welcome itself in these. In the others the employer writes it, or it stays in English. */
export const WELCOME_LANGUAGES = ['en', 'fi']

const primary = (code: string) => code.split('-')[0].toLowerCase()

export function findLanguage(code: string): LanguageOption | undefined {
  return LANGUAGES.find((language) => language.code === primary(code))
}

/** "Suomi (Finnish)", or the code itself for a language that is not in the list. */
export function languageName(code: string): string {
  const found = findLanguage(code)
  if (!found) return code
  return found.native === found.english ? found.native : `${found.native} (${found.english})`
}

export function speechLocale(code: string): string {
  return findLanguage(code)?.speech ?? code
}

export function writesWelcome(code: string): boolean {
  return WELCOME_LANGUAGES.includes(primary(code))
}
