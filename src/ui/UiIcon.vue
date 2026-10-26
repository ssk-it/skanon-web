<script setup lang="ts">
/**
 * An icon from the Material Symbols Outlined font, embedded by `main.ts`.
 *
 * `<UiIcon name="search" />` renders `<span class="material-symbols-outlined">search</span>`: the font's ligature turns the name into the image. The box is `mat-icon`'s — 24 px square (`src/styles.css`); a view that wants it smaller redefines `font-size`, `width` and `height` on `.material-symbols-outlined`, as it did on `mat-icon`.
 *
 * Decorative, like `mat-icon`: `aria-hidden` by default. A button with only an icon carries its name through `aria-label`.
 */
defineProps<{ name: string }>();
</script>

<template>
  <span class="material-symbols-outlined" aria-hidden="true">{{ name }}</span>
</template>
