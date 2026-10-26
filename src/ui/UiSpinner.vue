<script setup lang="ts">
import { computed } from "vue";

/**
 * The circular wait indicator: `mat-spinner`, indeterminate.
 *
 * ```vue
 * <UiSpinner :diameter="16" />
 * ```
 *
 * The proportions are Material's: a stroke a tenth of the diameter, on a circle of radius `(diameter − 10) / 2` in a box of `diameter − 10 + stroke`.
 */
const props = withDefaults(defineProps<{ diameter?: number }>(), {
  diameter: 48,
});

const geometry = computed(() => {
  const stroke = props.diameter / 10;
  const radius = (props.diameter - 10) / 2;
  const box = radius * 2 + stroke;
  const circumference = 2 * Math.PI * radius;
  return {
    stroke: stroke,
    radius: radius,
    box: box,
    circumference: circumference,
  };
});
</script>

<template>
  <span
    class="ui-spinner"
    role="progressbar"
    aria-valuemin="0"
    aria-valuemax="100"
    :style="{ width: `${diameter}px`, height: `${diameter}px` }"
  >
    <svg
      :viewBox="`0 0 ${geometry.box} ${geometry.box}`"
      focusable="false"
      aria-hidden="true"
    >
      <circle
        :cx="geometry.box / 2"
        :cy="geometry.box / 2"
        :r="geometry.radius"
        :stroke-width="geometry.stroke * (geometry.box / diameter)"
        :style="{
          strokeDasharray: `${geometry.circumference}`,
          '--ui-spinner-circonference': `${geometry.circumference}`,
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
