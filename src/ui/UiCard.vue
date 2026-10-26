<script setup lang="ts">
/**
 * A Material 3 card: `mat-card`, in its two appearances.
 *
 * ```vue
 * <UiCard>…</UiCard>
 * <UiCard appearance="outlined">…</UiCard>
 * ```
 *
 * SSK Canon imports `MatCardModule` in the specification screen without placing any `mat-card` there: the card is here so that a port that finds one does not have to reinvent its colours.
 */
withDefaults(defineProps<{ appearance?: "elevated" | "outlined" }>(), {
  appearance: "elevated",
});
</script>

<template>
  <div class="ui-carte" :class="`ui-carte--${appearance}`"><slot /></div>
</template>

<style>
.ui-carte {
  position: relative;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  border-radius: 12px;
}
.ui-carte--elevated {
  background: var(--mat-sys-surface-container-low);
  box-shadow: var(--mat-sys-level1);
}
.ui-carte--outlined {
  background: var(--mat-sys-surface);
  border: 1px solid var(--mat-sys-outline-variant);
}
</style>
