/**
 * Lowercased and stripped of diacritics, for matching in the browser.
 *
 * The API folds server-side with Postgres `unaccent`, so anything filtered
 * here has to agree with it — otherwise "kovac" finds "Kovač" in one list and
 * not in another, which reads as the search being broken rather than as two
 * different code paths.
 */
export function fold(value: string) {
  return value
    .normalize('NFKD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
}
