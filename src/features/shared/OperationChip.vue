<script setup lang="ts">
import { computed } from "vue";
import {
  LIBELLE_OPERATION,
  type OperationImpact,
} from "../../core/model/model";

/**
 * L'opération d'un impact. `touche` se distingue visuellement des trois autres : c'est la seule qui n'écrit rien, et cette différence compte à la relecture.
 */
const props = defineProps<{ operation: OperationImpact }>();

const libelle = computed(() => LIBELLE_OPERATION[props.operation]);
</script>

<template>
  <span class="operation-chip op" :class="'o-' + operation">{{ libelle }}</span>
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
