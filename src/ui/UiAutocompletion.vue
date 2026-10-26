<script setup lang="ts">
import { computed, nextTick, ref, useAttrs, useId } from "vue";
import UiTextField from "./UiChamp.vue";
import UiOptionList from "./UiListeOptions.vue";
import { placeBelow, useOverlay, type Position } from "./superposition";

/**
 * Un champ de saisie qui propose des valeurs : `matInput` et son `mat-autocomplete`.
 *
 * ```vue
 * <UiAutocompletion v-model="tag" libelle="Nature" :options="tagsProposes" indice="Choisir dans la liste, ou saisir une nature nouvelle" />
 * ```
 *
 * La saisie reste libre : une proposition choisie remplace le texte, rien n'oblige à en choisir une. Le filtrage appartient à l'appelant, qui passe les propositions déjà filtrées par ce qui est tapé. Comme chez Material, aucune proposition n'est active d'office : Entrée ne choisit qu'après une flèche. Les autres attributs, écouteurs et l'emplacement `#indice` passent à `UiChamp`.
 */
defineOptions({ inheritAttrs: false });

const model = defineModel<string>({ default: "" });

const props = defineProps<{
  options: readonly string[];
  label?: string;
  placeholder?: string;
  hint?: string | null;
  error?: string | null;
  disabled?: boolean;
}>();

const attrs = useAttrs();
const id = useId();
const listId = `${id}-liste`;
const field = ref<InstanceType<typeof UiTextField> | null>(null);
const list = ref<InstanceType<typeof UiOptionList> | null>(null);

const opened = ref(false);
const active = ref(-1);
const position = ref<Position>({ top: "0px", left: "0px" });

const visible = computed(() => opened.value && props.options.length > 0);
const shownOptions = computed(() =>
  props.options.map((label) => ({ label: label })),
);

function box(): HTMLElement | null {
  return field.value?.element?.closest(".ui-champ__boite") ?? null;
}

function reposition(): void {
  const anchor = box()?.getBoundingClientRect();
  if (!anchor) return;
  const panel = list.value?.element?.getBoundingClientRect();
  position.value = placeBelow(
    anchor,
    { width: panel?.width ?? 0, height: panel?.height ?? 0 },
    { anchorWidth: true },
  );
}

async function open(): Promise<void> {
  if (props.disabled) return;
  if (!opened.value) active.value = -1;
  opened.value = true;
  reposition();
  await nextTick();
  reposition();
}

function close(): void {
  opened.value = false;
  active.value = -1;
}

function choose(i: number): void {
  const value = props.options[i];
  if (value !== undefined) model.value = value;
  close();
}

useOverlay(opened, () => [box(), list.value?.element], close, reposition);

function onKey(e: KeyboardEvent): void {
  const total = props.options.length;
  switch (e.key) {
    case "ArrowDown":
      e.preventDefault();
      if (!visible.value) void open();
      else if (total) active.value = (active.value + 1) % total;
      break;
    case "ArrowUp":
      e.preventDefault();
      if (!visible.value) void open();
      else if (total)
        active.value = active.value <= 0 ? total - 1 : active.value - 1;
      break;
    case "Enter":
      if (visible.value && active.value >= 0) {
        e.preventDefault();
        choose(active.value);
      }
      break;
    case "Escape":
      if (visible.value) {
        e.preventDefault();
        e.stopPropagation();
        close();
      }
      break;
    case "Tab":
      close();
      break;
  }
}

function onInput(): void {
  active.value = -1;
  void open();
}
</script>

<template>
  <UiTextField
    ref="field"
    v-model="model"
    v-bind="attrs"
    :label="label"
    :placeholder="placeholder"
    :hint="hint"
    :error="error"
    :disabled="disabled"
    role="combobox"
    aria-autocomplete="list"
    :aria-expanded="visible"
    :aria-controls="visible ? listId : undefined"
    :aria-activedescendant="
      visible && active >= 0 ? `${listId}-${active}` : undefined
    "
    @focus="open"
    @input="onInput"
    @keydown="onKey"
  >
    <template v-if="$slots.indice" #indice><slot name="indice" /></template>
    <UiOptionList
      v-if="visible"
      :id="listId"
      ref="list"
      :options="shownOptions"
      :active="active"
      :position="position"
      :label="label"
      @choose="choose"
      @hover="active = $event"
    />
  </UiTextField>
</template>
