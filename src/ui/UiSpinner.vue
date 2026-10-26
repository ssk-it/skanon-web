<script setup lang="ts">
import { computed } from "vue";

/**
 * L'indicateur d'attente circulaire : `mat-spinner`, indéterminé.
 *
 * ```vue
 * <UiSpinner :diametre="16" />
 * ```
 *
 * Les proportions sont celles de Material : un trait du dixième du diamètre, sur un cercle de rayon `(diamètre − 10) / 2` dans une boîte de `diamètre − 10 + trait`.
 */
const props = withDefaults(defineProps<{ diametre?: number }>(), {
  diametre: 48,
});

const geometrie = computed(() => {
  const trait = props.diametre / 10;
  const rayon = (props.diametre - 10) / 2;
  const boite = rayon * 2 + trait;
  const circonference = 2 * Math.PI * rayon;
  return { trait, rayon, boite, circonference };
});
</script>

<template>
  <span
    class="ui-spinner"
    role="progressbar"
    aria-valuemin="0"
    aria-valuemax="100"
    :style="{ width: `${diametre}px`, height: `${diametre}px` }"
  >
    <svg
      :viewBox="`0 0 ${geometrie.boite} ${geometrie.boite}`"
      focusable="false"
      aria-hidden="true"
    >
      <circle
        :cx="geometrie.boite / 2"
        :cy="geometrie.boite / 2"
        :r="geometrie.rayon"
        :stroke-width="geometrie.trait * (geometrie.boite / diametre)"
        :style="{
          strokeDasharray: `${geometrie.circonference}`,
          '--ui-spinner-circonference': `${geometrie.circonference}`,
        }"
      />
    </svg>
  </span>
</template>

<style>
.ui-spinner {
  display: inline-block;
  flex: none;
  line-height: 0;
}
.ui-spinner svg {
  width: 100%;
  height: 100%;
  animation: ui-spinner-rotation 1568ms linear infinite;
}
.ui-spinner circle {
  fill: none;
  stroke: var(--mat-sys-primary);
  stroke-linecap: butt;
  transform-origin: center;
  animation: ui-spinner-trait 1333ms cubic-bezier(0.4, 0, 0.2, 1) infinite;
}
@keyframes ui-spinner-rotation {
  to {
    transform: rotate(360deg);
  }
}
@keyframes ui-spinner-trait {
  0% {
    stroke-dashoffset: calc(var(--ui-spinner-circonference) * 0.95);
    transform: rotate(0deg);
  }
  50% {
    stroke-dashoffset: calc(var(--ui-spinner-circonference) * 0.25);
    transform: rotate(45deg);
  }
  100% {
    stroke-dashoffset: calc(var(--ui-spinner-circonference) * 0.95);
    transform: rotate(360deg);
  }
}
@media (prefers-reduced-motion: reduce) {
  .ui-spinner svg,
  .ui-spinner circle {
    animation-duration: 4s;
  }
}
</style>
