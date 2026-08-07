<script setup lang="ts">
/**
 * DM's dice, with a stage. Rolls happen here (client-side); casting sends the
 * result to the table, where the display shuffles before settling — drama, no
 * rules engine. Chrome-less on purpose: parents wrap it in a ContentCard.
 */
const cast = useCast()
const toast = useToast()

const formula = ref('1d20')
const label = ref('')
const rolling = ref(false)

const lastResult = ref<{ formula: string, rolls: number[], modifier: number, total: number } | null>(null)

const QUICK = ['1d20', '2d20', '1d12', '1d10', '1d8', '2d6', '1d4', '1d100']

/** NdM+K / NdM-K / NdM. Returns null for anything else. */
function parse(input: string): { count: number, sides: number, modifier: number } | null {
  const match = input.trim().toLowerCase().match(/^(\d{0,2})d(\d{1,3})\s*([+-]\s*\d{1,3})?$/)
  if (!match) {
    return null
  }
  const count = Math.min(Number(match[1] || 1), 20)
  const sides = Number(match[2])
  const modifier = match[3] ? Number(match[3].replace(/\s/g, '')) : 0

  if (count < 1 || sides < 2 || sides > 100) {
    return null
  }
  return { count, sides, modifier }
}

const valid = computed(() => parse(formula.value) !== null)

async function roll(castIt: boolean) {
  const spec = parse(formula.value)
  if (!spec || rolling.value) {
    return
  }

  rolling.value = true

  try {
    const rolls = Array.from(
      { length: spec.count },
      () => 1 + Math.floor(Math.random() * spec.sides)
    )
    const total = rolls.reduce((sum, r) => sum + r, 0) + spec.modifier

    lastResult.value = { formula: formula.value.trim(), rolls, modifier: spec.modifier, total }

    if (castIt) {
      const result = await cast.set({
        mode: 'dice',
        payload: {
          formula: formula.value.trim(),
          rolls,
          modifier: spec.modifier,
          total,
          label: label.value.trim(),
          sides: spec.sides,
          // The display animates on every cast, even an identical roll
          nonce: Math.random().toString(36).slice(2)
        }
      })
      toast.add({
        title: `Rolled ${total} on the table`,
        icon: 'i-lucide-dices',
        color: result.displays_connected ? 'success' : 'warning',
        description: result.displays_connected ? undefined : 'No display connected'
      })
    }
  } catch (error) {
    toast.add({ title: apiErrorMessage(error), icon: 'i-lucide-circle-alert', color: 'error' })
  } finally {
    rolling.value = false
  }
}
</script>

<template>
  <div class="space-y-3">
    <div class="flex flex-wrap gap-1.5">
      <UButton
        v-for="quick in QUICK"
        :key="quick"
        :label="quick"
        size="xs"
        color="neutral"
        :variant="formula === quick ? 'solid' : 'outline'"
        @click="formula = quick"
      />
    </div>

    <div class="flex flex-wrap items-end gap-2">
      <UFormField
        label="Formula"
        class="w-28"
      >
        <UInput
          v-model="formula"
          placeholder="2d6+3"
          :color="valid ? undefined : 'error'"
          class="w-full font-mono"
        />
      </UFormField>
      <UFormField
        label="Label"
        class="min-w-32 flex-1"
      >
        <UInput
          v-model="label"
          placeholder="Strahd's charm save…"
          class="w-full"
        />
      </UFormField>
      <UButton
        label="Roll"
        icon="i-lucide-dices"
        color="neutral"
        variant="outline"
        :disabled="!valid || rolling"
        @click="roll(false)"
      />
      <UButton
        label="Roll & cast"
        icon="i-lucide-cast"
        :disabled="!valid"
        :loading="rolling"
        @click="roll(true)"
      />
    </div>

    <p
      v-if="lastResult"
      class="text-sm text-toned"
    >
      <span class="font-mono">{{ lastResult.formula }}</span> →
      <span class="font-semibold text-highlighted">{{ lastResult.total }}</span>
      <span class="text-muted">
        ({{ lastResult.rolls.join(' + ') }}{{ lastResult.modifier
          ? ` ${lastResult.modifier > 0 ? '+' : '−'} ${Math.abs(lastResult.modifier)}`
          : '' }})
      </span>
    </p>
  </div>
</template>
