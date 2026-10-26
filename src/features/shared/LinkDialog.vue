<script setup lang="ts">
import { computed, ref } from "vue";
import { inject } from "../../core/injection";
import { LINK_TAG_LABEL, type ExternalLink } from "../../core/model/model";
import { SpecificationStore } from "../../core/repo/specification.store";
import { normalizeTag } from "../../core/repo/link-tag";
import UiAutocomplete from "../../ui/UiAutocomplete.vue";
import UiButton from "../../ui/UiButton.vue";
import UiTextField from "../../ui/UiTextField.vue";
import UiDialog from "../../ui/UiDialog.vue";

/**
 * Saisie d'un lien externe attaché à un cadrage.
 *
 * L'adresse et le nom, plus la nature du lien : le nom seul ne dirait pas de quoi il s'agit, et la nature seule laisserait deux issues d'un même cadrage indiscernables. Les natures viennent du projet, non d'une liste en dur — voir `tags_liens` dans le fichier de configuration — et la saisie en accepte de nouvelles : aucune liste déclarée d'avance ne couvre les ressources que tous les projets référencent, et rien dans le format ne suppose la liste fermée. Celles déjà employées dans le dépôt sont proposées avec elle.
 *
 * Le même écran sert à corriger un lien existant, dont il reçoit alors les valeurs en `data` : une adresse se retape mal, et deux écrans pour une seule saisie les feraient diverger dès la première évolution — la validation de l'adresse la première.
 */
const props = defineProps<{
  /** Le lien à corriger, absent quand l'écran sert à en ajouter un. */
  data?: ExternalLink | null;
}>();

const emit = defineEmits<{ close: [lien?: ExternalLink] }>();

const store = inject(SpecificationStore);
const initial = props.data ?? null;

const modification = !!initial;

const url = ref(initial?.url ?? "");
const name = ref(initial?.name ?? "");

/** Celles du projet, plus celles que ses cadrages emploient déjà. */
const tags = computed(() => store.linkTags());

function tagLabel(tag: string): string {
  return LINK_TAG_LABEL[tag] ?? tag;
}

/**
 * Ce que le champ montre : le libellé, non la clé.
 *
 * Choisir « Carte Trello » dans la liste pour voir « carte_trello » s'inscrire donnerait à croire que la saisie a été corrigée. La forme écrite dans le frontmatter se retrouve par normalisation, qui rend justement la clé d'origine pour tout libellé connu.
 */
const tag = ref(tagLabel(initial?.tag || tags.value[0] || "document"));

/**
 * Les natures proposées, filtrées par ce qui est tapé.
 *
 * Le filtre porte sur la nature normalisée et sur son libellé : on cherche « Carte Trello » comme on l'a lue sur la fiche, pas comme elle s'écrit dans le frontmatter. La liste entière reste offerte tant que le champ vaut une nature connue — sinon la sélection d'une proposition masquerait toutes les autres, et changer d'avis demanderait de tout effacer.
 */
const proposedTags = computed(() => {
  const all = tags.value;
  const input = tag.value.trim().toLowerCase();
  const known = (t: string) =>
    t.toLowerCase() === input || tagLabel(t).toLowerCase() === input;
  if (!input || all.some(known)) return all;
  return all.filter(
    (t) =>
      t.toLowerCase().includes(input) ||
      tagLabel(t).toLowerCase().includes(input),
  );
});

/**
 * La nature telle qu'elle sera écrite dans le frontmatter.
 *
 * Accents pliés, séparateurs unifiés en soulignés, casse abaissée : la nature est une clé, et « Ticket Jira » saisi ici ne doit pas fonder une seconde nature à côté du « ticket_jira » déjà employé ailleurs. C'est aussi ce qui ramène le libellé montré dans le champ à la clé qu'il désigne — « Carte Trello » redonne « carte_trello ».
 */
const normalizedTag = computed(() => normalizeTag(tag.value));

const tagError = computed(() => {
  if (!tag.value.trim()) return null;
  return normalizedTag.value
    ? null
    : "Une nature s’écrit avec des lettres ou des chiffres.";
});

/**
 * Une adresse absolue en http(s), et rien d'autre.
 *
 * Un chemin relatif ou un `javascript:` n'a aucun sens ici : le premier ne résoudrait pas depuis le dépôt, le second ferait du frontmatter un vecteur d'exécution pour quiconque ouvre la fiche.
 */
const urlError = computed(() => {
  const raw = url.value.trim();
  if (!raw) return null;
  try {
    const u = new URL(raw);
    return u.protocol === "http:" || u.protocol === "https:"
      ? null
      : "L’adresse doit commencer par http:// ou https://.";
  } catch {
    return "Cette adresse n’est pas lisible.";
  }
});

/**
 * Le nom n'est pas exigé.
 *
 * Les liens écrits avant que le champ existe n'en portent pas, et la fiche les nomme par leur nature : l'imposer ici rendrait ces liens-là impossibles à corriger sans leur inventer un libellé au passage.
 */
const valid = computed(
  () => !!url.value.trim() && !urlError.value && !!normalizedTag.value,
);

function validate(): void {
  if (!valid.value) return;
  emit("close", {
    tag: normalizedTag.value,
    url: url.value.trim(),
    name: name.value.trim(),
  });
}
</script>

<template>
  <UiDialog
    class="lien-dialog"
    :title="modification ? 'Modifier le lien' : 'Ajouter un lien'"
  >
    <!-- L'indication porte l'erreur sans mettre le champ en erreur : c'est ainsi que SSK Canon l'affichait, par une classe sur son mat-hint. -->
    <UiTextField
      v-model="url"
      class="champ"
      label="Adresse"
      placeholder="https://…"
      autocomplete="off"
      data-focus-initial
    >
      <template #indice>
        <span class="ui-champ__indice" :class="{ erreur: !!urlError }">
          {{ urlError ?? "L’adresse complète, telle qu’on l’ouvre" }}
        </span>
      </template>
    </UiTextField>

    <UiTextField
      v-model="name"
      class="champ"
      label="Nom"
      autocomplete="off"
      hint="Le libellé affiché sur la fiche — à défaut, sa nature"
      @keyup.enter="validate()"
    />

    <UiAutocomplete
      v-model="tag"
      class="champ"
      label="Nature"
      :options="proposedTags.map(tagLabel)"
      autocomplete="off"
      @keyup.enter="validate()"
    >
      <template #indice>
        <span class="ui-champ__indice" :class="{ erreur: !!tagError }">
          {{
            tagError ?? "Choisir dans la liste, ou saisir une nature nouvelle"
          }}
        </span>
      </template>
    </UiAutocomplete>

    <template #actions>
      <UiButton @click="emit('close')">Annuler</UiButton>
      <UiButton variant="filled" :disabled="!valid" @click="validate()">
        {{ modification ? "Enregistrer" : "Ajouter" }}
      </UiButton>
    </template>
  </UiDialog>
</template>

<style scoped>
.champ {
  width: 100%;
}
.erreur {
  color: var(--mat-sys-error);
}
/* SSK Canon y posait aussi `padding-top: 8px`, que la règle de Material « titre + contenu » annulait par sa spécificité : le contenu commence donc au ras du titre, et l'écart n'est pas repris ici. */
.lien-dialog :deep(.ui-dialogue__contenu) {
  display: flex;
  flex-direction: column;
  min-width: min(420px, 78vw);
}
</style>
