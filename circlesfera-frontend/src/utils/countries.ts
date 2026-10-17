import { COUNTRY_CODES } from '@circlesfera/shared';

// The name of a country in the reader's language; the code itself when the
// browser has no name for it.
export function countryName(code: string, language: string): string {
  try {
    return (
      new Intl.DisplayNames([language], { type: 'region' }).of(code) ?? code
    );
  } catch {
    return code;
  }
}

// Every country of the closed list, by name in the reader's language.
export function countryOptions(
  language: string,
): { code: string; name: string }[] {
  return COUNTRY_CODES.map((code) => ({
    code,
    name: countryName(code, language),
  })).sort((a, b) => a.name.localeCompare(b.name, language));
}
