<script setup lang="ts">
import { computed, ref, useAttrs, useId, useSlots } from "vue";
import UiFieldFrame from "./UiFieldFrame.vue";

/**
 * A text field: `mat-form-field appearance="outline"` and its `matInput`, together.
 *
 * ```vue
 * <UiTextField v-model="title" label="Titre" hint="Ce que ce cadrage change, en une ligne." />
 * <UiTextField v-model="goal" label="Objectif" multiline :rows="5" />
 * <UiTextField v-model="input" label="Jeton" type="password" :error="error" @keyup.enter="validate()" />
 * ```
 *
 * - The label floats when the field has focus or a value, as in Material; `fixed-label` keeps it floating by default. The `placeholder` only shows with the label floating.
 * - `error` (a text) puts the field in error and replaces the hint; the `#indice` slot replaces the plain hint when it must carry its own style.
 * - `class` and `style` go to the frame; any other attribute and any listener (`@keyup.enter`, `@blur`, `aria-*`, `name`, `autocomplete`, `spellcheck`, `data-focus-initial`…) go to the `<input>` or the `<textarea>`.
 * - Width: 212 px by default, like `mat-form-field`; a view that wants it full width gives it `width: 100%`.
 */
defineOptions({ inheritAttrs: false });

const model = defineModel<string>({ default: "" });

const props = withDefaults(
  defineProps<{
    label?: string;
    type?: string;
    multiline?: boolean;
    rows?: number;
    placeholder?: string;
    hint?: string | null;
    error?: string | null;
    disabled?: boolean;
    fixedLabel?: boolean;
  }>(),
  {
    type: "text",
    multiline: false,
    rows: 2,
    disabled: false,
    label: undefined,
    placeholder: undefined,
    hint: null,
    error: null,
  },
);

const attrs = useAttrs();
const slots = useSlots();
const id = useId();
const focus = ref(false);
const control = ref<HTMLInputElement | HTMLTextAreaElement | null>(null);

const controlAttrs = computed(() => {
  const { class: _c, style: _s, ...rest } = attrs;
  return rest;
});

/** The error or the hint below the field, which the screen reader reads with it (RG-accessibilite-aa). */
const describedBy = computed(() =>
  props.error || props.hint || slots["indice"] ? `${id}-indices` : undefined,
);

const floating = computed(
  () => props.fixedLabel || focus.value || model.value !== "",
);

function enter(event: Event): void {
  model.value = (event.target as HTMLInputElement).value;
}

function activate(): void {
  if (!props.disabled) control.value?.focus();
}

defineExpose({
  /** Gives focus to the input. */
  focus: activate,
  /** The input element, for whoever must hook onto it — `UiAutocomplete`. */
  element: control,
});
</script>

<template>
  <UiFieldFrame
    :class="attrs.class"
    :style="attrs.style"
    :label="label"
    :control-id="id"
    :floating="floating"
    :focus="focus"
    :error="error"
    :hint="hint"
    :disabled="disabled"
    @activate="activate"
  >
    <textarea
      v-if="multiline"
      :id="id"
      ref="control"
      class="ui-champ__saisie"
      :value="model"
      :rows="rows"
      :placeholder="placeholder"
      :disabled="disabled"
      :aria-invalid="!!error || undefined"
      :aria-describedby="describedBy"
      v-bind="controlAttrs"
      @input="enter"
      @focus="focus = true"
      @blur="focus = false"
    ></textarea>
    <input
      v-else
      :id="id"
      ref="control"
      class="ui-champ__saisie"
      :type="type"
      :value="model"
      :placeholder="placeholder"
      :disabled="disabled"
      :aria-invalid="!!error || undefined"
      :aria-describedby="describedBy"
      v-bind="controlAttrs"
      @input="enter"
      @focus="focus = true"
      @blur="focus = false"
    />
    <!-- What accompanies the input in the frame: the panel of UiAutocomplete. -->
    <slot />
    <template v-if="$slots.indice" #indice><slot name="indice" /></template>
  </UiFieldFrame>
</template>
