<script setup lang="ts">
/**
 * PLACEHOLDER — a d20 silhouette until the real mark arrives.
 *
 * Uses `currentColor`, so the colour comes from the parent (`text-primary`,
 * `text-white`, …). Replace the paths here to rebrand; nothing else in the app
 * references the shapes.
 */
</script>

<template>
  <svg
    viewBox="0 0 32 32"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    stroke="currentColor"
    stroke-width="2"
    stroke-linejoin="round"
    stroke-linecap="round"
    aria-hidden="true"
  >
    <!-- Outer icosahedron silhouette -->
    <path d="M16 2 28.1 9v14L16 30 3.9 23V9L16 2Z" />

    <!-- The face you actually read the number off -->
    <path d="M16 7.5 24.5 22h-17L16 7.5Z" />

    <!-- Edges tying the face to the silhouette -->
    <path d="M16 7.5V2M24.5 22l3.6 1M7.5 22l-3.6 1" />
  </svg>
</template>
