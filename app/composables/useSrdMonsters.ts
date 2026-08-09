/**
 * The 5e SRD bestiary, searched live from Open5e.
 *
 * Open5e (https://open5e.com) serves the System Reference Document — the
 * openly licensed slice of the rules — over a public CORS-enabled API, so the
 * browser asks it directly and the backend never gets involved. One request
 * returns everything a statblock needs, actions with damage dice included,
 * which is exactly what the combat tracker wants and what a CSV of bare
 * numbers wouldn't carry.
 */

interface Open5eAction {
  name: string
  desc: string
}

interface Open5eMonster {
  slug: string
  name: string
  size: string
  type: string
  armor_class: number
  armor_desc: string | null
  hit_points: number
  challenge_rating: string
  speed: Record<string, number | boolean>
  strength: number
  dexterity: number
  constitution: number
  intelligence: number
  wisdom: number
  charisma: number
  actions: Open5eAction[] | null
}

export interface SrdMonster {
  slug: string
  name: string
  size: string
  kind: string
  cr: string
  ac: string
  hp: number
  /** Which book or file it came from, when known */
  source?: string
  /** Traits, saves, senses — statblock text that isn't a stat field */
  body?: string
  /** Ready to drop straight into the entity's data */
  data: Record<string, unknown>
}

const API = 'https://api.open5e.com/v1/monsters/'

export function useSrdMonsters() {
  function shape(monster: Open5eMonster): SrdMonster {
    const speed = Object.entries(monster.speed ?? {})
      .filter(([, value]) => typeof value === 'number')
      .map(([kind, feet]) => (kind === 'walk' ? `${feet} ft.` : `${kind} ${feet} ft.`))
      .join(', ')

    const abilities = [
      monster.strength, monster.dexterity, monster.constitution,
      monster.intelligence, monster.wisdom, monster.charisma
    ].join('/')

    // "Bite. Melee Weapon Attack: +4 to hit … Hit: 5 (1d6 + 2) piercing."
    // The tracker finds the dice in this text and turns them into buttons.
    const attacks = (monster.actions ?? [])
      .map(action => `${action.name}. ${action.desc}`)
      .join('\n')

    const ac = monster.armor_desc
      ? `${monster.armor_class} (${monster.armor_desc})`
      : String(monster.armor_class)

    return {
      slug: monster.slug,
      name: monster.name,
      size: monster.size,
      kind: monster.type.toLowerCase(),
      cr: monster.challenge_rating,
      ac,
      hp: monster.hit_points,
      data: {
        kind: monster.type.toLowerCase(),
        cr: monster.challenge_rating,
        ac,
        hp: monster.hit_points,
        speed,
        abilities,
        ...(attacks ? { attacks } : {})
      }
    }
  }

  /** SRD only — the openly licensed core, safe to copy into a campaign */
  async function search(query: string): Promise<SrdMonster[]> {
    const response = await $fetch<{ results: Open5eMonster[] }>(API, {
      query: {
        search: query.trim() || undefined,
        document__slug: 'wotc-srd',
        limit: 10
      }
    })
    return response.results.map(shape)
  }

  return { search }
}
