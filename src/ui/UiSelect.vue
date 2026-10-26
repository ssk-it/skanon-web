<script lang="ts">
/** Une option de la liste : sa valeur, et ce qui s'en affiche. */
export interface OptionSelect<V> {
  readonly valeur: V;
  readonly libelle: string;
}
</script>

<script setup lang="ts" generic="T">
import { computed, nextTick, ref, useId } from "vue";
import UiCadreChamp from "./UiCadreChamp.vue";
import UiListeOptions from "./UiListeOptions.vue";
import { placerSous, useSuperposition, type Position } from "./superposition";

/**
 * Une liste de choix : `mat-form-field appearance="outline"` et son `mat-select`.
 *
 * ```vue
 * <UiSelect
 *   v-model="portee"
 *   libelle="Ce jeton vaut pour"
 *   :options="[
 *     { valeur: 'ssk-it', libelle: 'l’organisation ssk-it' },
 *     { valeur: '', libelle: 'tous les autres dépôts' },
 *   ]"
 *   indice="Un jeton par organisation."
 * />
 * ```
 *
 * Les options sont des valeurs de tout type, comparées par `===`. Au clavier, comme chez Material : Entrée, Espace ou Alt+flèche ouvrent la liste ; les flèches, liste fermée, changent la valeur sans l'ouvrir ; Échap et Tab referment. `class` et `style` vont au cadre, le reste au déclencheur.
 */
defineOptions({ inheritAttrs: false });

const modele = defineModel<T>({ required: true });

const props = withDefaults(
  defineProps<{
    options: readonly OptionSelect<T>[];
    libelle?: string;
    indice?: string | null;
    disabled?: boolean;
  }>(),
  {
    disabled: false,
    libelle: undefined,
    indice: null,
  },
);

const id = useId();
const idListe = `${id}-liste`;
const declencheur = ref<HTMLElement | null>(null);
const liste = ref<InstanceType<typeof UiListeOptions> | null>(null);

const focus = ref(false);
const ouvert = ref(false);
const actif = ref(-1);
const position = ref<Position>({ top: "0px", left: "0px" });

const indexChoisi = computed(() =>
  props.options.findIndex((o) => o.valeur === modele.value),
);
const libelleChoisi = computed(
  () => props.options[indexChoisi.value]?.libelle ?? "",
);
const optionsAffichees = computed(() =>
  props.options.map((o, i) => ({
    libelle: o.libelle,
    selectionne: i === indexChoisi.value,
  })),
);

function boite(): HTMLElement | null {
  return declencheur.value?.closest(".ui-champ__boite") ?? null;
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
  if (props.disabled || ouvert.value) return;
  actif.value = Math.max(0, indexChoisi.value);
  ouvert.value = true;
  declencheur.value?.focus();
  replacer();
  await nextTick();
  replacer();
}

function fermer(): void {
  ouvert.value = false;
}

function choisir(i: number): void {
  const option = props.options[i];
  if (option) modele.value = option.valeur;
  fermer();
  declencheur.value?.focus();
}

useSuperposition(
  ouvert,
  () => [boite(), liste.value?.element],
  fermer,
  replacer,
);

function surTouche(e: KeyboardEvent): void {
  if (props.disabled) return;
  const total = props.options.length;
  if (!ouvert.value) {
    if (
      e.key === "Enter" ||
      e.key === " " ||
      (e.altKey && e.key.startsWith("Arrow"))
    ) {
      e.preventDefault();
      void ouvrir();
    } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!total) return;
      const pas = e.key === "ArrowDown" ? 1 : -1;
      const suivant = Math.min(total - 1, Math.max(0, indexChoisi.value + pas));
      modele.value = props.options[suivant].valeur;
    }
    return;
  }
  switch (e.key) {
    case "ArrowDown":
      e.preventDefault();
      actif.value = Math.min(total - 1, actif.value + 1);
      break;
    case "ArrowUp":
      e.preventDefault();
      actif.value = Math.max(0, actif.value - 1);
      break;
    case "Home":
      e.preventDefault();
      actif.value = 0;
      break;
    case "End":
      e.preventDefault();
      actif.value = total - 1;
      break;
    case "Enter":
    case " ":
      e.preventDefault();
      choisir(actif.value);
      break;
    case "Escape":
      // La liste se referme seule : le dialogue qui la porte, lui, reste ouvert.
      e.preventDefault();
      e.stopPropagation();
      fermer();
      break;
    case "Tab":
      fermer();
      break;
  }
}

defineExpose({ focus: () => declencheur.value?.focus() });
</script>

<template>
  <UiCadreChamp
    class="ui-select"
    :class="[$attrs.class, { 'ui-select--ouvert': ouvert }]"
    :style="$attrs.style"
    :libelle="libelle"
    :id-controle="id"
    :flotte="indexChoisi >= 0 || ouvert"
    :focus="focus || ouvert"
    :indice="indice"
    :desactive="disabled"
    @activer="ouvert ? fermer() : ouvrir()"
  >
    <div
      :id="id"
      ref="declencheur"
      class="ui-champ__saisie ui-select__declencheur"
      role="combobox"
      :tabindex="disabled ? -1 : 0"
      aria-haspopup="listbox"
      :aria-expanded="ouvert"
      :aria-controls="ouvert ? idListe : undefined"
      :aria-activedescendant="
        ouvert && actif >= 0 ? `${idListe}-${actif}` : undefined
      "
      :aria-disabled="disabled || undefined"
      :aria-label="libelle"
      v-bind="{ ...$attrs, class: undefined, style: undefined }"
      @keydown="surTouche"
      @focus="focus = true"
      @blur="focus = false"
    >
      <span class="ui-select__valeur">{{ libelleChoisi }}</span>
      <span class="ui-select__fleche" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="24" height="24" focusable="false">
          <path d="M7 10l5 5 5-5z" />
        </svg>
      </span>
    </div>
    <UiListeOptions
      v-if="ouvert"
      :id="idListe"
      ref="liste"
      :options="optionsAffichees"
      :actif="actif"
      :position="position"
      :libelle="libelle"
      @choisir="choisir"
      @survoler="actif = $event"
    />
  </UiCadreChamp>
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
