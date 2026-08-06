<script setup lang="ts">
const { theme, set, reset, isDefault } = useThemeSettings()
const colorMode = useColorMode()
const toast = useToast()
const api = useApi()

const { user, can } = useAuth()
const { workspace, name: workspaceName, tagline, update: updateWorkspace } = useWorkspace()

/* --- Profile ------------------------------------------------------------- */

const profile = reactive({ full_name: user.value?.full_name ?? '' })
const savingProfile = ref(false)

const profileChanged = computed(
  () => profile.full_name.trim() !== (user.value?.full_name ?? '')
)

async function saveProfile() {
  savingProfile.value = true

  try {
    user.value = await api.patch('/auth/me', { full_name: profile.full_name.trim() || null })
    toast.add({ title: 'Profile updated', icon: 'i-lucide-circle-check', color: 'success' })
  } catch (error) {
    toast.add({ title: apiErrorMessage(error), icon: 'i-lucide-circle-alert', color: 'error' })
  } finally {
    savingProfile.value = false
  }
}

/* --- Workspace ----------------------------------------------------------- */

const canEditWorkspace = computed(() => can('admin'))

const workspaceForm = reactive({
  name: workspaceName.value,
  tagline: tagline.value ?? ''
})

// The workspace loads after this page's setup runs, so mirror it in
watch(workspace, (value) => {
  if (value) {
    workspaceForm.name = value.name
    workspaceForm.tagline = value.tagline ?? ''
  }
}, { immediate: true })

const savingWorkspace = ref(false)

const workspaceChanged = computed(() =>
  workspaceForm.name.trim() !== (workspace.value?.name ?? '')
  || workspaceForm.tagline.trim() !== (workspace.value?.tagline ?? '')
)

async function saveWorkspace() {
  savingWorkspace.value = true

  try {
    await updateWorkspace({
      name: workspaceForm.name.trim(),
      tagline: workspaceForm.tagline.trim() || null
    })
    toast.add({ title: 'Workspace updated', icon: 'i-lucide-circle-check', color: 'success' })
  } catch (error) {
    toast.add({ title: apiErrorMessage(error), icon: 'i-lucide-circle-alert', color: 'error' })
  } finally {
    savingWorkspace.value = false
  }
}

/* --- Appearance ---------------------------------------------------------- */

const MODES = [
  { value: 'light', label: 'Light', icon: 'i-lucide-sun' },
  { value: 'dark', label: 'Dark', icon: 'i-lucide-moon' },
  { value: 'system', label: 'System', icon: 'i-lucide-monitor' }
]

const labelOf = (options: { value: string, label: string }[], value: string) =>
  options.find(option => option.value === value)?.label

const currentPrimary = computed(() => labelOf(PRIMARY_COLORS, theme.value.primary))
const currentNeutral = computed(() => labelOf(NEUTRAL_COLORS, theme.value.neutral))
const currentFont = computed(() => labelOf(FONTS, theme.value.font))
const currentRadius = computed(() => RADII.find(r => r.value === theme.value.radius)?.label)
</script>

<template>
  <AppPage
    title="Settings"
    description="Workspace, profile and appearance preferences."
    :breadcrumb="[
      { icon: 'i-lucide-house', to: '/' },
      { label: 'Settings' }
    ]"
  >
    <template #actions>
      <UButton
        color="neutral"
        variant="outline"
        icon="i-lucide-rotate-ccw"
        label="Reset appearance"
        class="rounded-xl"
        :disabled="isDefault"
        @click="reset"
      />
    </template>

    <!-- Profile -->
    <div class="app-card px-4 sm:px-6">
      <div class="flex items-center gap-2.5 pt-5 pb-1">
        <UIcon
          name="i-lucide-user"
          class="size-[18px] text-muted"
        />
        <h2 class="font-semibold text-highlighted">
          Profile
        </h2>
      </div>

      <SettingsRow
        title="Photo"
        description="Shown in the top bar and anywhere your account appears."
      >
        <AvatarUpload />
      </SettingsRow>

      <SettingsRow
        title="Name"
        description="How you're shown to the rest of the workspace."
      >
        <div class="flex w-full items-start gap-2 sm:w-80">
          <UInput
            v-model="profile.full_name"
            placeholder="Your name"
            class="flex-1"
            @keyup.enter="profileChanged && saveProfile()"
          />
          <UButton
            label="Save"
            :loading="savingProfile"
            :disabled="!profileChanged"
            @click="saveProfile"
          />
        </div>
      </SettingsRow>

      <SettingsRow
        title="Email"
        description="Used to sign in. Changing it isn't supported yet."
      >
        <UInput
          :model-value="user?.email"
          disabled
          class="w-full sm:w-80"
        />
      </SettingsRow>
    </div>

    <!-- Workspace -->
    <div class="app-card px-4 sm:px-6">
      <div class="flex items-center gap-2.5 pt-5 pb-1">
        <UIcon
          name="i-lucide-building-2"
          class="size-[18px] text-muted"
        />
        <h2 class="font-semibold text-highlighted">
          Workspace
        </h2>
        <UBadge
          v-if="!canEditWorkspace"
          label="Admins only"
          color="neutral"
          variant="subtle"
          size="sm"
        />
      </div>

      <SettingsRow
        title="Application name"
        description="Appears in the sidebar, the browser tab and the login screen."
      >
        <div class="flex w-full items-start gap-2 sm:w-80">
          <UInput
            v-model="workspaceForm.name"
            placeholder="Admin Dashboard"
            class="flex-1"
            :disabled="!canEditWorkspace"
            @keyup.enter="workspaceChanged && saveWorkspace()"
          />
        </div>
      </SettingsRow>

      <SettingsRow
        title="Tagline"
        description="The line on the login screen's brand panel."
      >
        <div class="flex w-full flex-col items-end gap-2 sm:w-80">
          <UTextarea
            v-model="workspaceForm.tagline"
            placeholder="One dashboard for every part of the business."
            :rows="2"
            class="w-full"
            :disabled="!canEditWorkspace"
          />
          <UButton
            label="Save workspace"
            :loading="savingWorkspace"
            :disabled="!canEditWorkspace || !workspaceChanged"
            @click="saveWorkspace"
          />
        </div>
      </SettingsRow>
    </div>

    <!-- Appearance -->
    <div class="app-card px-4 sm:px-6">
      <div class="flex items-center gap-2.5 pt-5 pb-1">
        <UIcon
          name="i-lucide-palette"
          class="size-[18px] text-muted"
        />
        <h2 class="font-semibold text-highlighted">
          Appearance
        </h2>
      </div>

      <SettingsRow
        title="Colour mode"
        description="Follow your operating system, or pick one."
      >
        <ClientOnly>
          <div class="flex gap-1.5 p-1 rounded-xl bg-elevated">
            <UButton
              v-for="mode in MODES"
              :key="mode.value"
              :icon="mode.icon"
              :label="mode.label"
              size="sm"
              class="rounded-lg"
              :color="colorMode.preference === mode.value ? 'primary' : 'neutral'"
              :variant="colorMode.preference === mode.value ? 'solid' : 'ghost'"
              @click="colorMode.preference = mode.value"
            />
          </div>

          <template #fallback>
            <div class="h-10 w-64 rounded-xl bg-elevated" />
          </template>
        </ClientOnly>
      </SettingsRow>

      <SettingsRow
        title="Primary colour"
        description="Used for active navigation, primary buttons and focus rings."
        :value="currentPrimary"
      >
        <div class="grid grid-cols-8 gap-2.5 w-max py-1">
          <ColorSwatch
            v-for="color in PRIMARY_COLORS"
            :key="color.value"
            :color="color"
            :selected="theme.primary === color.value"
            @click="set('primary', color.value)"
          />
        </div>
      </SettingsRow>

      <SettingsRow
        title="Neutral colour"
        description="The grey used for surfaces, borders and body text."
        :value="currentNeutral"
      >
        <div class="grid grid-cols-8 gap-2.5 w-max py-1">
          <ColorSwatch
            v-for="color in NEUTRAL_COLORS"
            :key="color.value"
            :color="color"
            :selected="theme.neutral === color.value"
            @click="set('neutral', color.value)"
          />
        </div>
      </SettingsRow>

      <SettingsRow
        title="Font"
        description="Applies to the whole application."
        :value="currentFont"
      >
        <div class="flex flex-wrap gap-2 sm:justify-end">
          <button
            v-for="font in FONTS"
            :key="font.value"
            type="button"
            class="flex flex-col items-center justify-center gap-0.5 w-20 h-16 rounded-xl border transition-colors cursor-pointer"
            :class="[
              font.class,
              theme.font === font.value
                ? 'border-primary bg-primary/5 text-highlighted'
                : 'border-default text-toned hover:bg-elevated'
            ]"
            @click="set('font', font.value)"
          >
            <span class="text-xl leading-none">Ag</span>
            <span class="text-xs">{{ font.label }}</span>
          </button>
        </div>
      </SettingsRow>

      <SettingsRow
        title="Corner radius"
        description="How rounded buttons, inputs and menus are."
        :value="currentRadius"
      >
        <div class="flex flex-wrap gap-1.5 sm:justify-end">
          <UButton
            v-for="radius in RADII"
            :key="radius.value"
            :label="radius.label"
            size="sm"
            class="rounded-lg w-12 justify-center"
            :color="theme.radius === radius.value ? 'primary' : 'neutral'"
            :variant="theme.radius === radius.value ? 'solid' : 'outline'"
            @click="set('radius', radius.value)"
          />
        </div>
      </SettingsRow>
    </div>

    <div class="app-card p-4 sm:p-6">
      <div class="flex items-center gap-2.5">
        <UIcon
          name="i-lucide-eye"
          class="size-[18px] text-muted"
        />
        <h2 class="font-semibold text-highlighted">
          Preview
        </h2>
      </div>
      <p class="mt-0.5 text-sm text-muted">
        Every change above applies immediately — this is just a compact sample.
      </p>

      <div class="mt-5 flex flex-wrap items-center gap-2">
        <UButton label="Primary" />
        <UButton
          label="Outline"
          color="neutral"
          variant="outline"
        />
        <UButton
          label="Ghost"
          color="neutral"
          variant="ghost"
        />
        <UButton
          icon="i-lucide-plus"
          label="With icon"
          variant="subtle"
        />
      </div>

      <div class="mt-4 flex flex-wrap items-center gap-2">
        <UBadge label="Primary" />
        <UBadge
          label="Success"
          color="success"
          variant="subtle"
        />
        <UBadge
          label="Warning"
          color="warning"
          variant="subtle"
        />
        <UBadge
          label="Error"
          color="error"
          variant="subtle"
        />
      </div>

      <div class="mt-5 grid gap-4 sm:grid-cols-2">
        <UFormField
          label="Project name"
          help="Inputs pick up the radius and neutral colour."
        >
          <UInput
            placeholder="Atlas"
            class="w-full"
          />
        </UFormField>

        <UFormField label="Progress">
          <UProgress
            :model-value="64"
            class="mt-3"
          />
        </UFormField>
      </div>

      <div class="mt-5 flex items-center gap-3">
        <USwitch
          :default-value="true"
          label="Email notifications"
        />
      </div>
    </div>
  </AppPage>
</template>
