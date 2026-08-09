<script setup lang="ts">
/**
 * What generation has cost, in the top bar.
 *
 * Cents are a hopeless unit for a running total — an illustration is under
 * one and a draft a fiftieth of one, so the number that matters never moves
 * and nobody watches it. Coins are sized so the cheapest thing the app does
 * still costs more than one, and the ledger reads like a ledger.
 *
 * Nothing is charged here and no payment is taken. The balance is money the
 * DM already put on their provider account, written down so there is
 * something to count down from.
 */
const { isDm } = useCampaigns()
const ai = useAi()
const toast = useToast()

const purse = ref<Purse | null>(null)
const open = ref(false)
const busy = ref(false)
const amount = ref(10)

/**
 * What OpenAI says the account actually spent, when an admin key is set.
 *
 * Our own ledger adds up what each generation reported costing; this is the
 * same question asked of the provider. Two things it deliberately isn't, and
 * both are said on screen: it covers the whole account rather than this
 * campaign, and it is spending rather than the balance left — OpenAI publishes
 * no endpoint for the balance at all.
 */
const billed = ref<Billed | null>(null)

async function load() {
  if (!isDm.value) {
    return
  }
  try {
    purse.value = await ai.purse()
  } catch {
    purse.value = null // no campaign, or not the DM — nothing worth shouting about
    return
  }

  if (purse.value?.can_reconcile) {
    try {
      billed.value = await ai.billed()
    } catch {
      billed.value = null // billing being unreachable isn't worth an alarm here
    }
  }
}

onMounted(load)

// Reopening is when a stale number would be noticed, so that's when it refreshes
watch(open, (isOpen) => {
  if (isOpen) {
    load()
  }
})

const spent = computed(() =>
  purse.value ? purse.value.spent_on_text + purse.value.spent_on_images : 0
)

/** Only meaningful once the DM has said what they put in */
const hasBudget = computed(() => (purse.value?.added ?? 0) > 0)

const low = computed(() => hasBudget.value && (purse.value?.balance ?? 0) < 5000)

const headline = computed(() => {
  if (!purse.value) {
    return '0'
  }
  return Math.round(hasBudget.value ? purse.value.balance : spent.value).toLocaleString()
})

/** Cents under a dollar: "$0.00" is true of 24 coins and tells you nothing */
function money(coins: number) {
  const dollars = coins / (purse.value?.coins_per_dollar ?? 10_000)
  return dollars < 1 ? `${(dollars * 100).toFixed(2)}¢` : `$${dollars.toFixed(2)}`
}

async function addFunds() {
  busy.value = true
  try {
    purse.value = await ai.topUp(amount.value)
    toast.add({
      title: `${(amount.value * (purse.value?.coins_per_dollar ?? 10_000)).toLocaleString()} coins added`,
      icon: 'i-lucide-coins',
      color: 'success'
    })
  } catch (error) {
    toast.add({ title: apiErrorMessage(error), icon: 'i-lucide-circle-alert', color: 'error' })
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <UPopover
    v-if="isDm && purse"
    v-model:open="open"
    :content="{ align: 'end' }"
  >
    <button
      type="button"
      class="flex items-center gap-1.5 rounded-full border border-default px-2.5 py-1 text-xs font-medium transition-colors hover:border-accented"
      :class="low ? 'border-warning/50 text-warning' : 'text-muted'"
      :aria-label="hasBudget ? 'Coins left' : 'Coins spent'"
    >
      <UIcon
        name="i-lucide-coins"
        class="size-3.5"
        :class="low ? 'text-warning' : 'text-amber-500'"
      />
      <span class="tabular-nums">{{ headline }}</span>
    </button>

    <template #content>
      <div class="w-72 space-y-3 p-3">
        <div>
          <p class="text-sm font-medium text-highlighted">
            {{ hasBudget ? 'Coins left' : 'Spent so far' }}
          </p>
          <p class="text-xs text-muted">
            {{ purse.coins_per_dollar.toLocaleString() }} coins to the dollar.
          </p>
        </div>

        <dl class="space-y-1.5 text-sm">
          <div class="flex items-baseline justify-between gap-3">
            <dt class="text-muted">
              Pictures
            </dt>
            <dd class="tabular-nums text-highlighted">
              {{ Math.round(purse.spent_on_images).toLocaleString() }}
            </dd>
          </div>
          <div class="flex items-baseline justify-between gap-3">
            <dt class="text-muted">
              Drafts
            </dt>
            <dd class="tabular-nums text-highlighted">
              {{ Math.round(purse.spent_on_text).toLocaleString() }}
            </dd>
          </div>
          <div class="flex items-baseline justify-between gap-3 border-t border-default pt-1.5">
            <dt class="font-medium text-highlighted">
              Total
            </dt>
            <dd class="tabular-nums font-medium text-highlighted">
              {{ Math.round(spent).toLocaleString() }}
              <span class="font-normal text-dimmed">· {{ money(spent) }}</span>
            </dd>
          </div>
        </dl>

        <div
          v-if="purse.entries.length"
          class="max-h-48 space-y-1 overflow-y-auto border-t border-default pt-2"
        >
          <div
            v-for="entry in purse.entries"
            :key="entry.id"
            class="flex items-baseline justify-between gap-3 text-xs"
          >
            <span class="min-w-0 flex-1 truncate text-muted">{{ entry.detail }}</span>
            <span
              class="shrink-0 tabular-nums"
              :class="entry.coins > 0 ? 'text-success' : 'text-dimmed'"
            >
              {{ entry.coins > 0 ? '+' : '' }}{{ Math.round(entry.coins).toLocaleString() }}
            </span>
          </div>
        </div>

        <div
          v-if="billed"
          class="space-y-0.5 border-t border-default pt-2"
        >
          <div class="flex items-baseline justify-between gap-3 text-sm">
            <span class="text-muted">OpenAI billed</span>
            <span class="tabular-nums text-highlighted">${{ billed.usd.toFixed(2) }}</span>
          </div>
          <p class="text-xs text-dimmed">
            The whole account over {{ billed.days }} days, not just this
            campaign — and what was spent, not what's left. OpenAI publishes no
            balance to read.
          </p>
        </div>

        <div class="space-y-1.5 border-t border-default pt-2">
          <p class="text-xs text-dimmed">
            Put money on your OpenAI account? Write it down here — nothing is
            charged by this app.
          </p>
          <div class="flex items-center gap-1.5">
            <UInputNumber
              v-model="amount"
              :min="1"
              :max="1000"
              size="xs"
              class="w-24"
            />
            <UButton
              label="Add"
              icon="i-lucide-plus"
              size="xs"
              color="neutral"
              variant="outline"
              :loading="busy"
              @click="addFunds"
            />
            <span class="text-xs text-dimmed">dollars</span>
          </div>
        </div>
      </div>
    </template>
  </UPopover>
</template>
