<script setup lang="ts" generic="T extends Record<string, any>">
import { h, resolveComponent } from 'vue'
import type { TableColumn } from '@nuxt/ui'

const props = withDefaults(defineProps<{
  data: T[]
  columns: TableColumn<T>[]
  loading?: boolean
  searchable?: boolean
  searchPlaceholder?: string
  /** Fields to match against. Defaults to every column's accessorKey. */
  searchKeys?: string[]
  /** 0 disables pagination */
  pageSize?: number
  emptyIcon?: string
  emptyTitle?: string
  emptyDescription?: string
}>(), {
  loading: false,
  searchable: true,
  searchPlaceholder: 'Search…',
  pageSize: 10,
  emptyIcon: 'i-lucide-search-x',
  emptyTitle: 'Nothing to show',
  emptyDescription: undefined
})

defineSlots<{
  /** Buttons on the right of the toolbar */
  actions?: () => unknown
}>()

const UButton = resolveComponent('UButton')

const search = ref('')
const page = ref(1)
const sort = ref<{ key: string, direction: 'asc' | 'desc' } | null>(null)

const accessorKeys = computed(() =>
  props.columns
    .map(column => (column as { accessorKey?: string }).accessorKey)
    .filter((key): key is string => !!key)
)

// Filter → sort → paginate, in that order. Letting the table sort would only
// ever sort the page it was handed.
const filtered = computed(() => {
  const term = search.value.trim().toLowerCase()
  if (!term) {
    return props.data
  }

  const keys = props.searchKeys ?? accessorKeys.value

  return props.data.filter(row =>
    keys.some(key => String(row[key] ?? '').toLowerCase().includes(term))
  )
})

const sorted = computed(() => {
  if (!sort.value) {
    return filtered.value
  }

  const { key, direction } = sort.value
  const factor = direction === 'asc' ? 1 : -1

  return [...filtered.value].sort((a, b) => {
    const left = a[key]
    const right = b[key]

    if (left === right) return 0
    if (left == null) return 1
    if (right == null) return -1

    if (typeof left === 'number' && typeof right === 'number') {
      return (left - right) * factor
    }

    return String(left).localeCompare(String(right), undefined, { numeric: true }) * factor
  })
})

const total = computed(() => sorted.value.length)

const paginated = computed(() => {
  if (!props.pageSize) {
    return sorted.value
  }
  const start = (page.value - 1) * props.pageSize
  return sorted.value.slice(start, start + props.pageSize)
})

// A narrowed result set can leave you past the last page
watch([total, () => props.pageSize], () => {
  const lastPage = props.pageSize ? Math.max(1, Math.ceil(total.value / props.pageSize)) : 1
  if (page.value > lastPage) {
    page.value = lastPage
  }
})

watch(search, () => {
  page.value = 1
})

function toggleSort(key: string) {
  if (sort.value?.key !== key) {
    sort.value = { key, direction: 'asc' }
  } else if (sort.value.direction === 'asc') {
    sort.value = { key, direction: 'desc' }
  } else {
    sort.value = null
  }
}

function sortIcon(key: string) {
  if (sort.value?.key !== key) return 'i-lucide-chevrons-up-down'
  return sort.value.direction === 'asc' ? 'i-lucide-arrow-up' : 'i-lucide-arrow-down'
}

// Columns opt out with `enableSorting: false`; string headers become buttons
const tableColumns = computed<TableColumn<T>[]>(() =>
  props.columns.map((column) => {
    const key = (column as { accessorKey?: string }).accessorKey
    const header = column.header

    if (!key || column.enableSorting === false || typeof header !== 'string') {
      return column
    }

    // Spreading a TanStack column def widens its discriminated union, so the
    // shape has to be asserted back
    return {
      ...column,
      header: () =>
        h(UButton, {
          label: header,
          color: 'neutral',
          variant: 'ghost',
          size: 'sm',
          icon: sortIcon(key),
          trailing: true,
          class: '-mx-2',
          onClick: () => toggleSort(key)
        })
    } as TableColumn<T>
  })
)

const isEmpty = computed(() => !props.loading && total.value === 0)
</script>

<template>
  <div class="flex flex-col">
    <div
      v-if="searchable || $slots.actions"
      class="flex flex-wrap items-center justify-between gap-3 p-4 sm:px-5"
    >
      <UInput
        v-if="searchable"
        v-model="search"
        :placeholder="searchPlaceholder"
        icon="i-lucide-search"
        class="w-full sm:w-64"
      >
        <template
          v-if="search"
          #trailing
        >
          <UButton
            color="neutral"
            variant="link"
            size="xs"
            icon="i-lucide-x"
            aria-label="Clear search"
            @click="search = ''"
          />
        </template>
      </UInput>

      <div
        v-if="$slots.actions"
        class="flex items-center gap-2"
      >
        <slot name="actions" />
      </div>
    </div>

    <div
      v-if="loading"
      class="space-y-3 px-4 pb-4 sm:px-5"
    >
      <USkeleton
        v-for="row in 5"
        :key="row"
        class="h-11 w-full"
      />
    </div>

    <div
      v-else-if="isEmpty"
      class="flex flex-col items-center justify-center gap-3 px-6 py-14 text-center"
    >
      <span class="flex size-12 items-center justify-center rounded-2xl bg-elevated text-dimmed">
        <UIcon
          :name="emptyIcon"
          class="size-6"
        />
      </span>
      <div>
        <p class="font-medium text-highlighted">
          {{ emptyTitle }}
        </p>
        <p
          v-if="emptyDescription || search"
          class="mt-1 text-sm text-muted"
        >
          {{ search ? `No results for “${search}”.` : emptyDescription }}
        </p>
      </div>
    </div>

    <UTable
      v-else
      :data="paginated"
      :columns="tableColumns"
      :ui="{ base: 'w-full min-w-[36rem]' }"
    />

    <div
      v-if="pageSize && total > pageSize"
      class="flex flex-wrap items-center justify-between gap-3 border-t border-default p-4 sm:px-5 sm:py-3"
    >
      <p class="text-sm text-muted tabular-nums">
        {{ (page - 1) * pageSize + 1 }}–{{ Math.min(page * pageSize, total) }} of {{ total }}
      </p>

      <UPagination
        v-model:page="page"
        :total="total"
        :items-per-page="pageSize"
        :sibling-count="1"
      />
    </div>
  </div>
</template>
