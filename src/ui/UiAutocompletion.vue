<script setup lang="ts">
import { computed, nextTick, ref, useAttrs, useId } from "vue";
import UiChamp from "./UiChamp.vue";
import UiListeOptions from "./UiListeOptions.vue";
import { placerSous, useSuperposition, type Position } from "./superposition";

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

const modele = defineModel<string>({ default: "" });

const props = defineProps<{
  options: readonly string[];
  libelle?: string;
  placeholder?: string;
  indice?: string | null;
  erreur?: string | null;
  disabled?: boolean;
}>();

const attrs = useAttrs();
const id = useId();
const idListe = `${id}-liste`;
const champ = ref<InstanceType<typeof UiChamp> | null>(null);
const liste = ref<InstanceType<typeof UiListeOptions> | null>(null);

const ouvert = ref(false);
const actif = ref(-1);
const position = ref<Position>({ top: "0px", left: "0px" });

const visible = computed(() => ouvert.value && props.options.length > 0);
const optionsAffichees = computed(() =>
  props.options.map((libelle) => ({ libelle })),
);

function boite(): HTMLElement | null {
  return champ.value?.element?.closest(".ui-champ__boite") ?? null;
}

function replacer(): void {
  const ancre = boite()?.getBoundingClientRect();
  if (!ancre) return;
  const panneau = liste.value?.element?.getBoundingClientRect();
  position.value = placerSous(
    ancre,
    { width: panneau?.width ?? 0, height: panneau?.height ?? 0 },
    { largeurAncre: true },
  );
}

async function ouvrir(): Promise<void> {
  if (props.disabled) return;
  if (!ouvert.value) actif.value = -1;
  ouvert.value = true;
  replacer();
  await nextTick();
  replacer();
}

function fermer(): void {
  ouvert.value = false;
  actif.value = -1;
}

function choisir(i: number): void {
  const valeur = props.options[i];
  if (valeur !== undefined) modele.value = valeur;
  fermer();
}

useSuperposition(
  ouvert,
  () => [boite(), liste.value?.element],
  fermer,
  replacer,
);

function surTouche(e: KeyboardEvent): void {
  const total = props.options.length;
  switch (e.key) {
    case "ArrowDown":
      e.preventDefault();
      if (!visible.value) void ouvrir();
      else if (total) actif.value = (actif.value + 1) % total;
      break;
    case "ArrowUp":
      e.preventDefault();
      if (!visible.value) void ouvrir();
      else if (total)
        actif.value = actif.value <= 0 ? total - 1 : actif.value - 1;
      break;
    case "Enter":
      if (visible.value && actif.value >= 0) {
        e.preventDefault();
        choisir(actif.value);
      }
      break;
    case "Escape":
      if (visible.value) {
        e.preventDefault();
        e.stopPropagation();
        fermer();
      }
      break;
    case "Tab":
      fermer();
      break;
  }
}

function surSaisie(): void {
  actif.value = -1;
  void ouvrir();
}
</script>

<template>
  <UiChamp
    ref="champ"
    v-model="modele"
    v-bind="attrs"
    :libelle="libelle"
    :placeholder="placeholder"
    :indice="indice"
    :erreur="erreur"
    :disabled="disabled"
    role="combobox"
    aria-autocomplete="list"
    :aria-expanded="visible"
    :aria-controls="visible ? idListe : undefined"
    :aria-activedescendant="
      visible && actif >= 0 ? `${idListe}-${actif}` : undefined
    "
    @focus="ouvrir"
    @input="surSaisie"
    @keydown="surTouche"
  >
    <template v-if="$slots.indice" #indice><slot name="indice" /></template>
    <UiListeOptions
      v-if="visible"
      :id="idListe"
      ref="liste"
      :options="optionsAffichees"
      :actif="actif"
      :position="position"
      :libelle="libelle"
      @choisir="choisir"
      @survoler="actif = $event"
    />
  </UiChamp>
</template>
