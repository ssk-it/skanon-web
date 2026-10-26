<script setup lang="ts">
import { nextTick, ref, watch } from "vue";
import { Z_PANEL, type Position } from "./superposition";

/**
 * La liste d'options commune à `UiSelect` et `UiAutocompletion` : le panneau de `mat-select` et de `mat-autocomplete`, téléporté dans `body`. Interne au kit.
 *
 * Le focus reste sur le contrôle qui l'a ouverte : l'option active se désigne par `aria-activedescendant`, et la souris choisit sans voler le focus (`mousedown.prevent`).
 */
const props = defineProps<{
  id: string;
  options: readonly {
    readonly label: string;
    readonly selected?: boolean;
  }[];
  active: number;
  position: Position;
  label?: string;
}>();

const emit = defineEmits<{
  choose: [index: number];
  hover: [index: number];
}>();

const list = ref<HTMLUListElement | null>(null);

/** L'option active reste visible quand les flèches la font sortir du panneau. */
watch(
  () => props.active,
  async (i) => {
    await nextTick();
    const option = list.value?.children[i] as HTMLElement | undefined;
    option?.scrollIntoView?.({ block: "nearest" });
  },
);

defineExpose({ element: list });
</script>

<template>
  <Teleport to="body">
    <ul
      :id="id"
      ref="list"
      class="ui-options"
      role="listbox"
      :aria-label="label"
      :style="{ ...position, zIndex: Z_PANEL }"
    >
      <li
        v-for="(o, i) in options"
        :id="`${id}-${i}`"
        :key="i"
        class="ui-options__option"
        :class="{
          'ui-options__option--actif': i === active,
          'ui-options__option--selectionne': o.selected,
        }"
        role="option"
        :aria-selected="!!o.selected"
        @mousedown.prevent
        @click="emit('choose', i)"
        @mouseenter="emit('hover', i)"
      >
        {{ o.label }}
      </li>
    </ul>
  </Teleport>
</template>

<style>
.ui-options {
  position: fixed;
  box-sizing: border-box;
  margin: 0;
  padding: 8px 0;
  list-style: none;
  max-height: 275px;
  overflow: auto;
  scrollbar-gutter: stable;
  border-radius: 4px;
  background: var(--mat-sys-surface-container);
  box-shadow: var(--mat-sys-level2);
  font-family: Roboto, sans-serif;
}

.ui-options__option {
  position: relative;
  display: flex;
  align-items: center;
  min-height: 48px;
  padding: 0 16px;
  color: var(--mat-sys-on-surface);
  font-size: 1rem;
  line-height: 1.5rem;
  letter-spacing: 0.031rem;
  cursor: pointer;
  user-select: none;
}
.ui-options__option::before {
  content: "";
  position: absolute;
  inset: 0;
  background: var(--mat-sys-on-surface);
  opacity: 0;
  pointer-events: none;
}
.ui-options__option--actif::before {
  opacity: 0.08;
}
.ui-options__option--selectionne {
  background: var(--mat-sys-secondary-container);
  color: var(--mat-sys-on-secondary-container);
}
</style>
