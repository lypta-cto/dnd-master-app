<script setup lang="ts">
const api = useApi()
const toast = useToast()
const { user, displayName, avatarUrl, initials } = useAuth()

const input = useTemplateRef<HTMLInputElement>('input')
const uploading = ref(false)

// Browser-side mirror of the backend's limit, so an oversized file is rejected
// before it's uploaded rather than after
const MAX_BYTES = 5 * 1024 * 1024
const ACCEPT = 'image/jpeg,image/png,image/webp,image/gif'

async function onFileChange(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (!file) {
    return
  }

  if (file.size > MAX_BYTES) {
    toast.add({
      title: 'Image is too large',
      description: 'Pick something under 5 MB.',
      icon: 'i-lucide-circle-alert',
      color: 'error'
    })
    return
  }

  uploading.value = true

  try {
    const body = new FormData()
    body.append('file', file)

    user.value = await api.post('/auth/me/avatar', body)
    toast.add({ title: 'Photo updated', icon: 'i-lucide-circle-check', color: 'success' })
  } catch (error) {
    toast.add({
      title: apiErrorMessage(error, 'Upload failed'),
      icon: 'i-lucide-circle-alert',
      color: 'error'
    })
  } finally {
    uploading.value = false
    // Reset so picking the same file again still fires `change`
    if (input.value) {
      input.value.value = ''
    }
  }
}

async function removeAvatar() {
  uploading.value = true

  try {
    user.value = await api.del('/auth/me/avatar')
    toast.add({ title: 'Photo removed', icon: 'i-lucide-circle-check', color: 'success' })
  } catch (error) {
    toast.add({
      title: apiErrorMessage(error, 'Could not remove the photo'),
      icon: 'i-lucide-circle-alert',
      color: 'error'
    })
  } finally {
    uploading.value = false
  }
}
</script>

<template>
  <div class="flex items-center gap-4">
    <div class="relative">
      <UAvatar
        :src="avatarUrl"
        :alt="displayName"
        :text="initials"
        size="3xl"
      />
      <div
        v-if="uploading"
        class="absolute inset-0 flex items-center justify-center rounded-full bg-default/70"
      >
        <UIcon
          name="i-lucide-loader-circle"
          class="size-5 animate-spin text-primary"
        />
      </div>
    </div>

    <div class="flex flex-col gap-2">
      <div class="flex flex-wrap gap-2">
        <UButton
          label="Upload photo"
          icon="i-lucide-upload"
          color="neutral"
          variant="outline"
          size="sm"
          :disabled="uploading"
          @click="input?.click()"
        />
        <UButton
          v-if="user?.avatar_url"
          label="Remove"
          icon="i-lucide-trash-2"
          color="neutral"
          variant="ghost"
          size="sm"
          :disabled="uploading"
          @click="removeAvatar"
        />
      </div>

      <p class="text-xs text-muted">
        JPG, PNG, WebP or GIF, up to 5 MB. Resized to 512 px.
      </p>
    </div>

    <input
      ref="input"
      type="file"
      :accept="ACCEPT"
      class="hidden"
      @change="onFileChange"
    >
  </div>
</template>
