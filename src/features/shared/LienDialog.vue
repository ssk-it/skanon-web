<script setup lang="ts">
import { computed, ref } from "vue";
import { inject } from "../../core/injection";
import { LIBELLE_TAG_LIEN, type LienExterne } from "../../core/model/model";
import { ReferentielStore } from "../../core/repo/referentiel.store";
import { normaliserTag } from "../../core/repo/tag-lien";
import UiAutocompletion from "../../ui/UiAutocompletion.vue";
import UiBouton from "../../ui/UiBouton.vue";
import UiChamp from "../../ui/UiChamp.vue";
import UiDialogue from "../../ui/UiDialogue.vue";

/**
 * Saisie d'un lien externe attaché à un cadrage.
 *
 * L'adresse et le nom, plus la nature du lien : le nom seul ne dirait pas de quoi il s'agit, et la nature seule laisserait deux issues d'un même cadrage indiscernables. Les natures viennent du projet, non d'une liste en dur — voir `tags_liens` dans le fichier de configuration — et la saisie en accepte de nouvelles : aucune liste déclarée d'avance ne couvre les ressources que tous les projets référencent, et rien dans le format ne suppose la liste fermée. Celles déjà employées dans le dépôt sont proposées avec elle.
 *
 * Le même écran sert à corriger un lien existant, dont il reçoit alors les valeurs en `data` : une adresse se retape mal, et deux écrans pour une seule saisie les feraient diverger dès la première évolution — la validation de l'adresse la première.
 */
const props = defineProps<{
  /** Le lien à corriger, absent quand l'écran sert à en ajouter un. */
  data?: LienExterne | null;
}>();

const emit = defineEmits<{ fermer: [lien?: LienExterne] }>();

const store = inject(ReferentielStore);
const initial = props.data ?? null;

const modification = !!initial;

const url = ref(initial?.url ?? "");
const nom = ref(initial?.nom ?? "");

/** Celles du projet, plus celles que ses cadrages emploient déjà. */
const tags = computed(() => store.tagsLiens());

function libelleTag(tag: string): string {
  return LIBELLE_TAG_LIEN[tag] ?? tag;
}

/**
 * Ce que le champ montre : le libellé, non la clé.
 *
 * Choisir « Carte Trello » dans la liste pour voir « carte_trello » s'inscrire donnerait à croire que la saisie a été corrigée. La forme écrite dans le frontmatter se retrouve par normalisation, qui rend justement la clé d'origine pour tout libellé connu.
 */
const tag = ref(libelleTag(initial?.tag || tags.value[0] || "document"));

/**
 * Les natures proposées, filtrées par ce qui est tapé.
 *
 * Le filtre porte sur la nature normalisée et sur son libellé : on cherche « Carte Trello » comme on l'a lue sur la fiche, pas comme elle s'écrit dans le frontmatter. La liste entière reste offerte tant que le champ vaut une nature connue — sinon la sélection d'une proposition masquerait toutes les autres, et changer d'avis demanderait de tout effacer.
 */
const tagsProposes = computed(() => {
  const tous = tags.value;
  const saisi = tag.value.trim().toLowerCase();
  const connu = (t: string) =>
    t.toLowerCase() === saisi || libelleTag(t).toLowerCase() === saisi;
  if (!saisi || tous.some(connu)) return tous;
  return tous.filter(
    (t) =>
      t.toLowerCase().includes(saisi) ||
      libelleTag(t).toLowerCase().includes(saisi),
  );
});

/**
 * La nature telle qu'elle sera écrite dans le frontmatter.
 *
 * Accents pliés, séparateurs unifiés en soulignés, casse abaissée : la nature est une clé, et « Ticket Jira » saisi ici ne doit pas fonder une seconde nature à côté du « ticket_jira » déjà employé ailleurs. C'est aussi ce qui ramène le libellé montré dans le champ à la clé qu'il désigne — « Carte Trello » redonne « carte_trello ».
 */
const tagNormalise = computed(() => normaliserTag(tag.value));

const erreurTag = computed(() => {
  if (!tag.value.trim()) return null;
  return tagNormalise.value
    ? null
    : "Une nature s’écrit avec des lettres ou des chiffres.";
});

/**
 * Une adresse absolue en http(s), et rien d'autre.
 *
 * Un chemin relatif ou un `javascript:` n'a aucun sens ici : le premier ne résoudrait pas depuis le dépôt, le second ferait du frontmatter un vecteur d'exécution pour quiconque ouvre la fiche.
 */
const erreurUrl = computed(() => {
  const brut = url.value.trim();
  if (!brut) return null;
  try {
    const u = new URL(brut);
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
const valide = computed(
  () => !!url.value.trim() && !erreurUrl.value && !!tagNormalise.value,
);

function valider(): void {
  if (!valide.value) return;
  emit("fermer", {
    tag: tagNormalise.value,
    url: url.value.trim(),
    nom: nom.value.trim(),
  });
}
</script>

<template>
  <UiDialogue
    class="lien-dialog"
    :titre="modification ? 'Modifier le lien' : 'Ajouter un lien'"
  >
    <!-- L'indication porte l'erreur sans mettre le champ en erreur : c'est ainsi que SSK Canon l'affichait, par une classe sur son mat-hint. -->
    <UiChamp
      v-model="url"
      class="champ"
      libelle="Adresse"
      placeholder="https://…"
      autocomplete="off"
      data-focus-initial
    >
      <template #indice>
        <span class="ui-champ__indice" :class="{ erreur: !!erreurUrl }">
          {{ erreurUrl ?? "L’adresse complète, telle qu’on l’ouvre" }}
        </span>
      </template>
    </UiChamp>

    <UiChamp
      v-model="nom"
      class="champ"
      libelle="Nom"
      autocomplete="off"
      indice="Le libellé affiché sur la fiche — à défaut, sa nature"
      @keyup.enter="valider()"
    />

    <UiAutocompletion
      v-model="tag"
      class="champ"
      libelle="Nature"
      :options="tagsProposes.map(libelleTag)"
      autocomplete="off"
      @keyup.enter="valider()"
    >
      <template #indice>
        <span class="ui-champ__indice" :class="{ erreur: !!erreurTag }">
          {{
            erreurTag ?? "Choisir dans la liste, ou saisir une nature nouvelle"
          }}
        </span>
      </template>
    </UiAutocompletion>

    <template #actions>
      <UiBouton @click="emit('fermer')">Annuler</UiBouton>
      <UiBouton variante="filled" :disabled="!valide" @click="valider()">
        {{ modification ? "Enregistrer" : "Ajouter" }}
      </UiBouton>
    </template>
  </UiDialogue>
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
