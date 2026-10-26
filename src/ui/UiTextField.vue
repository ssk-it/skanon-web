<script setup lang="ts">
import { computed, ref, useAttrs, useId } from "vue";
import UiFieldFrame from "./UiFieldFrame.vue";

/**
 * Un champ de saisie : `mat-form-field appearance="outline"` et son `matInput`, ensemble.
 *
 * ```vue
 * <UiChamp v-model="titre" libelle="Titre" indice="Ce que ce cadrage change, en une ligne." />
 * <UiChamp v-model="objectif" libelle="Objectif" multiligne :rows="5" />
 * <UiChamp v-model="saisie" libelle="Jeton" type="password" :erreur="erreur" @keyup.enter="valider()" />
 * ```
 *
 * - Le libellé flotte quand le champ a le focus ou une valeur, comme chez Material ; `libelle-fixe` le tient flottant d'office. Le `placeholder` ne se montre que libellé flottant.
 * - `erreur` (un texte) met le champ en erreur et remplace l'indication ; l'emplacement `#indice` remplace l'indication simple quand elle doit porter un style à elle.
 * - `class` et `style` vont au cadre ; tout autre attribut et tout écouteur (`@keyup.enter`, `@blur`, `aria-*`, `name`, `autocomplete`, `spellcheck`, `data-focus-initial`…) vont à l'`<input>` ou au `<textarea>`.
 * - Largeur : 212 px par défaut, comme `mat-form-field` ; une vue qui le veut pleine largeur lui donne `width: 100%`.
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
const id = useId();
const focus = ref(false);
const control = ref<HTMLInputElement | HTMLTextAreaElement | null>(null);

const controlAttrs = computed(() => {
  const { class: _c, style: _s, ...rest } = attrs;
  return rest;
});

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
  /** Donne le focus à la saisie. */
  focus: activate,
  /** L'élément de saisie, pour qui doit s'y accrocher — `UiAutocompletion`. */
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
      v-bind="controlAttrs"
      @input="enter"
      @focus="focus = true"
      @blur="focus = false"
    />
    <!-- Ce qui accompagne la saisie dans le cadre : le panneau de UiAutocompletion. -->
    <slot />
    <template v-if="$slots.indice" #indice><slot name="indice" /></template>
  </UiFieldFrame>
</template>
