/**
 * One line of an encounter's roster, as EncounterPrep saves it.
 *
 * Lines keep their own `name` rather than only pointing at a monster:
 * deleting the bestiary entry later should leave the encounter readable.
 */
export interface RosterLine {
  id: string
  entity_id: string | null
  name: string
  count: number
  /** Copied when the line is added, so starting a fight needs no lookup */
  hp: number | null
}

/**
 * Turning a prepared encounter into the running fight.
 *
 * Shared between the encounter's own page and the combat screen's chooser —
 * a session preps several fights, and whichever door the DM starts one
 * through, the same thing must happen: the party joins on its own, every
 * copy gets its number and its prepped position, and the map comes along.
 */
export function useRunEncounter() {
  const entities = useEntities()
  const combat = useCombat()

  const lineId = () => Math.random().toString(36).slice(2, 10)

  /** Matches how EncounterPrep keys its placements */
  const placementKey = (line: RosterLine, copy: number) => `${line.id}#${copy}`

  async function run(encounter: { name: string, data: Record<string, unknown> }): Promise<CombatState> {
    const roster = Array.isArray(encounter.data.roster)
      ? (encounter.data.roster as RosterLine[])
      : []
    const placements
      = (encounter.data.placements as Record<string, { x: number, y: number }>) ?? {}

    // The party comes along: an initiative order without them is half a fight,
    // and the DM would only add them by hand a moment later. Anyone the
    // encounter explicitly excludes — captured, elsewhere, sitting this one
    // out — stays behind.
    const excluded = new Set(
      Array.isArray(encounter.data.excluded_party)
        ? (encounter.data.excluded_party as string[])
        : []
    )
    const party = await entities.list({ type: 'character', page_size: 50 })

    const combatants: Combatant[] = party.items
      .filter(character => !excluded.has(character.id))
      .map(character => ({
        id: lineId(),
        name: character.name,
        kind: 'character' as const,
        entity_id: character.id,
        initiative: 0,
        max_hp: Number(character.data.max_hp) || null,
        current_hp: character.data.current_hp === undefined
          ? Number(character.data.max_hp) || null
          : Number(character.data.current_hp),
        conditions: []
      }))

    for (const line of roster) {
      for (let copy = 1; copy <= line.count; copy++) {
        // Where it was prepped to stand, carried through rather than left to
        // be redone from memory once the table is watching
        const at = placements[placementKey(line, copy)]

        combatants.push({
          id: lineId(),
          // Numbered only when there is more than one, so a lone king stays
          // "Goblin King" rather than "Goblin King 1"
          name: line.count > 1 ? `${line.name} ${copy}` : line.name,
          kind: line.entity_id ? 'monster' : 'custom',
          entity_id: line.entity_id,
          initiative: 0,
          max_hp: line.hp,
          current_hp: line.hp,
          conditions: [],
          x: at?.x ?? null,
          y: at?.y ?? null
        })
      }
    }

    const state: CombatState = {
      active: true,
      round: 1,
      turn_index: 0,
      map_id: (encounter.data.map_id as string | null) ?? null,
      combatants
    }

    await combat.set(state)
    return state
  }

  return { run }
}
