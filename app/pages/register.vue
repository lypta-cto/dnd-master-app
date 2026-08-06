<script setup lang="ts">
import type { AuthFormField, FormError, FormSubmitEvent } from '@nuxt/ui'

definePageMeta({ layout: 'auth' })

useHead({ title: 'Create account' })

const toast = useToast()
const { register } = useAuth()

const loading = ref(false)
const serverError = ref<string | null>(null)

const fields: AuthFormField[] = [
  {
    name: 'full_name',
    type: 'text',
    label: 'Full name',
    placeholder: 'Ada Lovelace'
  },
  {
    name: 'email',
    type: 'email',
    label: 'Email',
    placeholder: 'you@company.com',
    required: true
  },
  {
    name: 'password',
    type: 'password',
    label: 'Password',
    placeholder: 'At least 8 characters',
    required: true
  },
  {
    name: 'confirm',
    type: 'password',
    label: 'Confirm password',
    placeholder: '••••••••',
    required: true
  }
]

function validate(state: Record<string, unknown>): FormError[] {
  const errors: FormError[] = []
  const email = String(state.email ?? '')
  const password = String(state.password ?? '')
  const confirm = String(state.confirm ?? '')

  if (!email) {
    errors.push({ name: 'email', message: 'Email is required' })
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    errors.push({ name: 'email', message: 'Enter a valid email address' })
  }

  // Matches the backend's minimum, so the request isn't wasted
  if (password.length < 8) {
    errors.push({ name: 'password', message: 'Must be at least 8 characters' })
  }

  if (confirm !== password) {
    errors.push({ name: 'confirm', message: 'Passwords do not match' })
  }

  return errors
}

async function onSubmit(event: FormSubmitEvent<Record<string, unknown>>) {
  loading.value = true
  serverError.value = null

  try {
    const fullName = String(event.data.full_name ?? '').trim()

    await register({
      email: String(event.data.email),
      password: String(event.data.password),
      ...(fullName ? { full_name: fullName } : {})
    })

    toast.add({
      title: 'Account created',
      description: 'You are signed in.',
      icon: 'i-lucide-circle-check',
      color: 'success'
    })

    await navigateTo('/')
  } catch (error) {
    serverError.value = apiErrorMessage(error, 'Could not create the account.')
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <UAuthForm
    :fields="fields"
    :validate="validate"
    :loading="loading"
    title="Create your account"
    description="You'll be signed in straight away."
    :submit="{ label: 'Create account', size: 'lg', block: true }"
    :ui="{ title: 'text-2xl', description: 'text-sm' }"
    @submit="onSubmit"
  >
    <template #validation>
      <UAlert
        v-if="serverError"
        color="error"
        variant="subtle"
        icon="i-lucide-circle-alert"
        :title="serverError"
      />
    </template>

    <template #footer>
      Already have an account?
      <ULink
        to="/login"
        class="text-primary font-medium"
      >
        Sign in
      </ULink>
    </template>
  </UAuthForm>
</template>
