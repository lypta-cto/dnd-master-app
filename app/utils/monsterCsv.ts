import type { SrdMonster } from '~/composables/useSrdMonsters'

/**
 * A monster spreadsheet, read the way spreadsheets actually are.
 *
 * Built against the "Monster Spreadsheet (D&D5e)" sheet that's passed around
 * DM circles — Name/Size/Type/AC/HP/Speeds/six abilities/CR plus traits —
 * but the columns are found by header name, not position, so any sheet with
 * roughly those headings works. Parsed in the browser; the file never leaves
 * the DM's machine except as the entities they choose to import.
 */

/** Quoted fields, commas inside quotes, doubled quotes — the whole grammar */
function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false

  for (let i = 0; i < text.length; i++) {
    const char = text[i]!

    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i++
        } else {
          quoted = false
        }
      } else {
        field += char
      }
    } else if (char === '"') {
      quoted = true
    } else if (char === ',') {
      row.push(field)
      field = ''
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[i + 1] === '\n') {
        i++
      }
      row.push(field)
      field = ''
      if (row.some(cell => cell.trim() !== '')) {
        rows.push(row)
      }
      row = []
    } else {
      field += char
    }
  }

  row.push(field)
  if (row.some(cell => cell.trim() !== '')) {
    rows.push(row)
  }

  return rows
}

/** "0.25" → "1/4": sheets store CR as decimals, tables say it in fractions */
function readableCr(raw: string): string {
  const value = Number(raw)
  if (Number.isNaN(value)) {
    return raw.trim()
  }
  const fractions: Record<string, string> = { 0.125: '1/8', 0.25: '1/4', 0.5: '1/2' }
  return fractions[value] ?? String(value)
}

const pick = (headers: string[], ...names: string[]) => {
  for (const name of names) {
    const index = headers.findIndex(h => h === name)
    if (index !== -1) {
      return index
    }
  }
  return -1
}

export function parseMonsterCsv(text: string): SrdMonster[] {
  const rows = parseCsv(text)
  if (rows.length < 2) {
    return []
  }

  const headers = rows[0]!.map(h => h.trim().toLowerCase().replace(/[.:]/g, ''))

  const col = {
    name: pick(headers, 'name', 'monster'),
    size: pick(headers, 'size'),
    type: pick(headers, 'type'),
    ac: pick(headers, 'ac', 'armor class'),
    hp: pick(headers, 'hp', 'hit points'),
    speed: pick(headers, 'speeds', 'speed'),
    str: pick(headers, 'str', 'strength'),
    dex: pick(headers, 'dex', 'dexterity'),
    con: pick(headers, 'con', 'constitution'),
    int: pick(headers, 'int', 'intelligence'),
    wis: pick(headers, 'wis', 'wisdom'),
    cha: pick(headers, 'cha', 'charisma'),
    cr: pick(headers, 'cr', 'challenge', 'challenge rating'),
    traits: pick(headers, 'additional', 'traits', 'abilities'),
    saves: pick(headers, 'sav throws', 'saving throws', 'saves'),
    skills: pick(headers, 'skills'),
    senses: pick(headers, 'senses'),
    languages: pick(headers, 'languages'),
    source: pick(headers, 'font', 'source', 'book')
  }

  if (col.name === -1) {
    return []
  }

  const cell = (row: string[], index: number) => (index === -1 ? '' : (row[index] ?? '').trim())

  return rows.slice(1).flatMap((row) => {
    const name = cell(row, col.name)
    if (!name) {
      return []
    }

    const kind = cell(row, col.type).toLowerCase()
    const cr = readableCr(cell(row, col.cr))
    const abilityCells = [col.str, col.dex, col.con, col.int, col.wis, col.cha]
      .map(index => cell(row, index))
    const abilities = abilityCells.every(Boolean) ? abilityCells.join('/') : ''

    // What doesn't fit a stat field still matters mid-fight — traits, saves,
    // senses — so it lands in the body where the monster page shows it.
    const notes = [
      ['Traits', cell(row, col.traits)],
      ['Saving throws', cell(row, col.saves)],
      ['Skills', cell(row, col.skills)],
      ['Senses', cell(row, col.senses)],
      ['Languages', cell(row, col.languages)]
    ]
      .filter(([, value]) => value && value.toLowerCase() !== 'none')
      .map(([label, value]) => `**${label}:** ${value}`)
      .join('\n\n')

    return [{
      slug: `csv:${name.toLowerCase()}`,
      name,
      size: cell(row, col.size),
      kind,
      cr,
      ac: cell(row, col.ac),
      hp: Number(cell(row, col.hp)) || 0,
      source: cell(row, col.source),
      body: notes || undefined,
      data: {
        ...(kind ? { kind } : {}),
        ...(cr ? { cr } : {}),
        ...(cell(row, col.ac) ? { ac: cell(row, col.ac) } : {}),
        ...(cell(row, col.hp) ? { hp: Number(cell(row, col.hp)) || cell(row, col.hp) } : {}),
        ...(cell(row, col.speed) ? { speed: cell(row, col.speed) } : {}),
        ...(abilities ? { abilities } : {})
      }
    } satisfies SrdMonster]
  })
}
