<script lang="ts">
/** An option of the list: its value, and what is shown of it. */
export interface SelectOption<V> {
  readonly value: V;
  readonly label: string;
}
</script>

<script setup lang="ts" generic="T">
import { computed, nextTick, ref, useId } from "vue";
import UiFieldFrame from "./UiFieldFrame.vue";
import UiOptionList from "./UiOptionList.vue";
import { placeBelow, useOverlay, type Position } from "./overlay";

/**
 * A select: `mat-form-field appearance="outline"` and its `mat-select`.
 *
 * ```vue
 * <UiSelect
 *   v-model="scope"
 *   label="Ce jeton vaut pour"
 *   :options="[
 *     { value: 'ssk-it', label: 'l’organisation ssk-it' },
 *     { value: '', label: 'tous les autres dépôts' },
 *   ]"
 *   hint="Un jeton par organisation."
 * />
 * ```
 *
 * Options are values of any type, compared with `===`. On the keyboard, as in Material: Enter, Space or Alt+arrow open the list; the arrow keys, list closed, change the value without opening it; Escape and Tab close it. `class` and `style` go to the frame, the rest to the trigger.
 */
defineOptions({ inheritAttrs: false });

const model = defineModel<T>({ required: true });

const props = withDefaults(
  defineProps<{
    options: readonly SelectOption<T>[];
    label?: string;
    hint?: string | null;
    disabled?: boolean;
  }>(),
  {
    disabled: false,
    label: undefined,
    hint: null,
  },
);

const id = useId();
const listId = `${id}-liste`;
const trigger = ref<HTMLElement | null>(null);
const list = ref<InstanceType<typeof UiOptionList> | null>(null);

const focus = ref(false);
const opened = ref(false);
const active = ref(-1);
const position = ref<Position>({ top: "0px", left: "0px" });

const selectedIndex = computed(() =>
  props.options.findIndex((o) => o.value === model.value),
);
const selectedLabel = computed(
  () => props.options[selectedIndex.value]?.label ?? "",
);
const shownOptions = computed(() =>
  props.options.map((o, i) => ({
    label: o.label,
    selected: i === selectedIndex.value,
  })),
);

function box(): HTMLElement | null {
  return trigger.value?.closest(".ui-champ__boite") ?? null;
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
  if (props.disabled || opened.value) return;
  active.value = Math.max(0, selectedIndex.value);
  opened.value = true;
  trigger.value?.focus();
  reposition();
  await nextTick();
  reposition();
}

function close(): void {
  opened.value = false;
}

function choose(i: number): void {
  const option = props.options[i];
  if (option) model.value = option.value;
  close();
  trigger.value?.focus();
}

useOverlay(opened, () => [box(), list.value?.element], close, reposition);

function onKey(e: KeyboardEvent): void {
  if (props.disabled) return;
  const total = props.options.length;
  if (!opened.value) {
    if (
      e.key === "Enter" ||
      e.key === " " ||
      (e.altKey && e.key.startsWith("Arrow"))
    ) {
      e.preventDefault();
      void open();
    } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!total) return;
      const step = e.key === "ArrowDown" ? 1 : -1;
      const next = Math.min(total - 1, Math.max(0, selectedIndex.value + step));
      model.value = props.options[next].value;
    }
    return;
  }
  switch (e.key) {
    case "ArrowDown":
      e.preventDefault();
      active.value = Math.min(total - 1, active.value + 1);
      break;
    case "ArrowUp":
      e.preventDefault();
      active.value = Math.max(0, active.value - 1);
      break;
    case "Home":
      e.preventDefault();
      active.value = 0;
      break;
    case "End":
      e.preventDefault();
      active.value = total - 1;
      break;
    case "Enter":
    case " ":
      e.preventDefault();
      choose(active.value);
      break;
    case "Escape":
      // The list closes on its own: the dialog holding it stays open.
      e.preventDefault();
      e.stopPropagation();
      close();
      break;
    case "Tab":
      close();
      break;
  }
}

defineExpose({ focus: () => trigger.value?.focus() });
</script>

<template>
  <UiFieldFrame
    class="ui-select"
    :class="[$attrs.class, { 'ui-select--ouvert': opened }]"
    :style="$attrs.style"
    :label="label"
    :control-id="id"
    :floating="selectedIndex >= 0 || opened"
    :focus="focus || opened"
    :hint="hint"
    :disabled="disabled"
    @activate="opened ? close() : open()"
  >
    <div
      :id="id"
      ref="trigger"
      class="ui-champ__saisie ui-select__declencheur"
      role="combobox"
      :tabindex="disabled ? -1 : 0"
      aria-haspopup="listbox"
      :aria-expanded="opened"
      :aria-controls="opened ? listId : undefined"
      :aria-activedescendant="
        opened && active >= 0 ? `${listId}-${active}` : undefined
      "
      :aria-disabled="disabled || undefined"
      :aria-label="label"
      v-bind="{ ...$attrs, class: undefined, style: undefined }"
      @keydown="onKey"
      @focus="focus = true"
      @blur="focus = false"
    >
      <span class="ui-select__valeur">{{ selectedLabel }}</span>
      <span class="ui-select__fleche" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="24" height="24" focusable="false">
          <path d="M7 10l5 5 5-5z" />
        </svg>
      </span>
    </div>
    <UiOptionList
      v-if="opened"
      :id="listId"
      ref="list"
      :options="shownOptions"
      :active="active"
      :position="position"
      :label="label"
      @choose="choose"
      @hover="active = $event"
    />
  </UiFieldFrame>
</template>

<style>
.ui-select .ui-champ__boite {
  cursor: pointer;
}
.ui-select.ui-champ--desactive .ui-champ__boite {
  cursor: default;
}
.ui-select__declencheur {
  display: flex;
  align-items: center;
  outline: none;
  cursor: inherit;
}
.ui-select__valeur {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ui-select__fleche {
  display: inline-flex;
  flex: none;
  width: 24px;
  height: 24px;
  margin-left: 8px;
  fill: var(--mat-sys-on-surface-variant);
}
.ui-champ--focus .ui-select__fleche {
  fill: var(--mat-sys-primary);
}
.ui-champ--desactive .ui-select__fleche {
  fill: color-mix(in srgb, var(--mat-sys-on-surface) 38%, transparent);
}
</style>
