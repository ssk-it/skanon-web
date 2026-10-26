<script setup lang="ts">
import { computed, ref, useAttrs, useId } from "vue";
import UiCadreChamp from "./UiCadreChamp.vue";

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

const modele = defineModel<string>({ default: "" });

const props = withDefaults(
  defineProps<{
    libelle?: string;
    type?: string;
    multiligne?: boolean;
    rows?: number;
    placeholder?: string;
    indice?: string | null;
    erreur?: string | null;
    disabled?: boolean;
    libelleFixe?: boolean;
  }>(),
  {
    type: "text",
    multiligne: false,
    rows: 2,
    disabled: false,
    libelle: undefined,
    placeholder: undefined,
    indice: null,
    erreur: null,
  },
);

const attrs = useAttrs();
const id = useId();
const focus = ref(false);
const controle = ref<HTMLInputElement | HTMLTextAreaElement | null>(null);

const attrsControle = computed(() => {
  const { class: _c, style: _s, ...reste } = attrs;
  return reste;
});

const flotte = computed(
  () => props.libelleFixe || focus.value || modele.value !== "",
);

function saisir(evenement: Event): void {
  modele.value = (evenement.target as HTMLInputElement).value;
}

function activer(): void {
  if (!props.disabled) controle.value?.focus();
}

defineExpose({
  /** Donne le focus à la saisie. */
  focus: activer,
  /** L'élément de saisie, pour qui doit s'y accrocher — `UiAutocompletion`. */
  element: controle,
});
</script>

<template>
  <UiCadreChamp
    :class="attrs.class"
    :style="attrs.style"
    :libelle="libelle"
    :id-controle="id"
    :flotte="flotte"
    :focus="focus"
    :erreur="erreur"
    :indice="indice"
    :desactive="disabled"
    @activer="activer"
  >
    <textarea
      v-if="multiligne"
      :id="id"
      ref="controle"
      class="ui-champ__saisie"
      :value="modele"
      :rows="rows"
      :placeholder="placeholder"
      :disabled="disabled"
      :aria-invalid="!!erreur || undefined"
      v-bind="attrsControle"
      @input="saisir"
      @focus="focus = true"
      @blur="focus = false"
    ></textarea>
    <input
      v-else
      :id="id"
      ref="controle"
      class="ui-champ__saisie"
      :type="type"
      :value="modele"
      :placeholder="placeholder"
      :disabled="disabled"
      :aria-invalid="!!erreur || undefined"
      v-bind="attrsControle"
      @input="saisir"
      @focus="focus = true"
      @blur="focus = false"
    />
    <!-- Ce qui accompagne la saisie dans le cadre : le panneau de UiAutocompletion. -->
    <slot />
    <template v-if="$slots.indice" #indice><slot name="indice" /></template>
  </UiCadreChamp>
</template>
