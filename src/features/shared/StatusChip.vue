<script setup lang="ts">
import { computed } from "vue";
import {
  SCOPING_STATUS_LABEL,
  type ScopingStatus,
} from "../../core/model/model";

/**
 * A scoping's status, encoded by shape as much as by text: colour alone is not enough to tell four states apart at a glance.
 */
const props = defineProps<{ status: ScopingStatus }>();

const label = computed(() => SCOPING_STATUS_LABEL[props.status]);
</script>

<template>
  <span class="statut-chip chip" :class="'s-' + status">{{ label }}</span>
</template>

<style scoped>
.chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  font-weight: 500;
  letter-spacing: 0.01em;
  padding: 2px 10px;
  border-radius: 4px;
  white-space: nowrap;
  border: 1px solid transparent;
}
.chip::before {
  content: "";
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: currentColor;
  flex: none;
}
.s-brouillon {
  color: var(--pc-statut-brouillon);
  background: var(--pc-statut-brouillon-bg);
  border-color: var(--pc-statut-brouillon-bd);
}
.s-en_relecture {
  color: var(--pc-statut-relecture);
  background: var(--pc-statut-relecture-bg);
  border-color: var(--pc-statut-relecture-bd);
}
.s-validee {
  color: var(--pc-statut-validee);
  background: var(--pc-statut-validee-bg);
  border-color: var(--pc-statut-validee-bd);
}
.s-livree {
  color: var(--pc-statut-livree);
  background: var(--pc-statut-livree-bg);
  border-color: var(--pc-statut-livree-bd);
}
</style>
