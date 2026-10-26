<script setup lang="ts">
import { computed } from "vue";
import { OPERATION_LABEL, type ImpactOperation } from "../../core/model/model";

/**
 * An impact's operation. `touche` is visually distinct from the other three: it is the only one that writes nothing, and that difference matters during review.
 */
const props = defineProps<{ operation: ImpactOperation }>();

const label = computed(() => OPERATION_LABEL[props.operation]);
</script>

<template>
  <span class="operation-chip op" :class="'o-' + operation">{{ label }}</span>
</template>

<style scoped>
.op {
  display: inline-block;
  font-family: var(--pc-mono);
  font-size: 11px;
  font-weight: 500;
  letter-spacing: 0.02em;
  padding: 2px 8px;
  border-radius: 3px;
  white-space: nowrap;
}
.o-cree {
  color: var(--pc-op-cree);
  background: var(--pc-op-cree-bg);
}
.o-modifie {
  color: var(--pc-op-modifie);
  background: var(--pc-op-modifie-bg);
}
.o-abroge {
  color: var(--pc-op-abroge);
  background: var(--pc-op-abroge-bg);
}
.o-touche {
  color: var(--pc-op-touche);
  background: var(--pc-op-touche-bg);
  border: 1px dashed var(--pc-op-touche-bd);
  padding: 1px 7px;
}
</style>
