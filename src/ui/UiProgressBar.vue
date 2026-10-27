<script setup lang="ts">
/**
 * The progress bar: `mat-progress-bar`.
 *
 * ```vue
 * <UiProgressBar />                 <!-- indeterminate -->
 * <UiProgressBar :value="42" />     <!-- determinate, in percent -->
 * ```
 *
 * Without `value`, it is indeterminate: progress is not known, only activity is.
 */
defineProps<{ value?: number | null }>();
</script>

<template>
  <div
    class="ui-barre"
    :class="{ 'ui-barre--indeterminee': value == null }"
    role="progressbar"
    aria-valuemin="0"
    aria-valuemax="100"
    :aria-valuenow="value == null ? undefined : Math.round(value)"
  >
    <div
      v-if="value != null"
      class="ui-barre__indicateur"
      :style="{
        transform: `scaleX(${Math.min(100, Math.max(0, value)) / 100})`,
      }"
    ></div>
    <template v-else>
      <div class="ui-barre__indicateur ui-barre__primaire"></div>
      <div class="ui-barre__indicateur ui-barre__secondaire"></div>
    </template>
  </div>
</template>

<style>
.ui-barre {
  position: relative;
  display: block;
  width: 100%;
  height: 4px;
  overflow: hidden;
  background: var(--mat-sys-surface-variant);
}
.ui-barre__indicateur {
  position: absolute;
  inset: 0;
  background: var(--mat-sys-primary);
  transform-origin: left center;
  transition: transform 250ms ease;
}
.ui-barre--indeterminee .ui-barre__indicateur {
  transition: none;
}
.ui-barre__primaire {
  animation: ui-barre-primaire 2s infinite linear;
}
.ui-barre__secondaire {
  animation: ui-barre-secondaire 2s infinite linear;
}
@keyframes ui-barre-primaire {
  0% {
    transform: translateX(-100%) scaleX(0.08);
  }
  37% {
    transform: translateX(-60%) scaleX(0.3);
  }
  70% {
    transform: translateX(40%) scaleX(0.66);
  }
  100% {
    transform: translateX(110%) scaleX(0.1);
  }
}
@keyframes ui-barre-secondaire {
  0% {
    transform: translateX(-100%) scaleX(0.08);
  }
  50% {
    transform: translateX(-100%) scaleX(0.08);
  }
  80% {
    transform: translateX(20%) scaleX(0.6);
  }
  100% {
    transform: translateX(105%) scaleX(0.1);
  }
}
/* Slower rather than stopped: still, the bar would no longer say that something is awaited. */
@media (prefers-reduced-motion: reduce) {
  .ui-barre__primaire,
  .ui-barre__secondaire {
    animation-duration: 6s;
  }
}
</style>
