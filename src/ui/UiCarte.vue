<script setup lang="ts">
/**
 * Une carte de Material 3 : `mat-card`, dans ses deux apparences.
 *
 * ```vue
 * <UiCarte>…</UiCarte>
 * <UiCarte apparence="outlined">…</UiCarte>
 * ```
 *
 * SSK Canon importe `MatCardModule` dans l'écran du référentiel sans y poser de `mat-card` : la carte est là pour qu'un portage qui en trouverait une n'ait pas à réinventer ses couleurs.
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
