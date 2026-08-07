<script setup lang="ts">
import type { AuthFormField, FormError, FormSubmitEvent } from '@nuxt/ui'

definePageMeta({ layout: 'auth' })

useHead({ title: 'Sign in' })

const toast = useToast()
const route = useRoute()
const { login } = useAuth()

const loading = ref(false)
const serverError = ref<string | null>(null)

// TODO: drop the defaultValues before this template goes anywhere real
const fields: AuthFormField[] = [
  {
    name: 'email',
    type: 'email',
    label: 'Email',
    placeholder: 'you@company.com',
    defaultValue: 'luka.savovic@lypta.ai',
    required: true
  },
  {
    name: 'password',
    type: 'password',
    label: 'Password',
    placeholder: '••••••••',
    defaultValue: 'changeme123',
    required: true
  },
  {
    name: 'remember',
    type: 'checkbox',
    label: 'Keep me signed in'
  }
]

// Plain function rather than a schema library so the template stays dependency-free
function validate(state: Record<string, unknown>): FormError[] {
  const errors: FormError[] = []
  const email = String(state.email ?? '')
  const password = String(state.password ?? '')

  if (!email) {
    errors.push({ name: 'email', message: 'Email is required' })
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    errors.push({ name: 'email', message: 'Enter a valid email address' })
  }

  if (!password) {
    errors.push({ name: 'password', message: 'Password is required' })
  }

  return errors
}

async function onSubmit(event: FormSubmitEvent<Record<string, unknown>>) {
  loading.value = true
  serverError.value = null

  try {
    await login({
      email: String(event.data.email),
      password: String(event.data.password)
    })

    toast.add({ title: 'Signed in', icon: 'i-lucide-circle-check', color: 'success' })

    // Send them back to whatever the middleware interrupted
    await navigateTo(typeof route.query.redirect === 'string' ? route.query.redirect : '/')
  } catch (error) {
    serverError.value = apiErrorMessage(error, 'Could not sign in. Please try again.')
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
    title="Welcome back"
    description="Sign in to your workspace to continue."
    :submit="{ label: 'Sign in', size: 'lg', block: true }"
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

    <template #password-hint>
      <ULink
        to="/help"
        class="text-sm text-primary font-medium"
      >
        Forgot password?
      </ULink>
    </template>

    <template #footer>
      Don't have an account?
      <ULink
        to="/register"
        class="text-primary font-medium"
      >
        Create one
      </ULink>
    </template>
  </UAuthForm>
</template>
