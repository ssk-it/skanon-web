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
 * Input of an external link attached to a scoping.
 *
 * The address and the name, plus the link's kind: the name alone would not say what it is about, and the kind alone would leave two issues of the same scoping indistinguishable. Kinds come from the project, not from a hard-coded list — see `tags_liens` in the configuration file — and the input accepts new ones: no list declared in advance covers the resources every project references, and nothing in the format assumes a closed list. Those already used in the repo are offered along with it.
 *
 * The same screen serves to correct an existing link, whose values it then receives in `data`: an address is easily mistyped, and two screens for a single input would make them diverge from the first change on — the address validation first.
 */
const props = defineProps<{
  /** The link to correct, absent when the screen serves to add one. */
  data?: ExternalLink | null;
}>();

const emit = defineEmits<{ close: [lien?: ExternalLink] }>();

const store = inject(SpecificationStore);
const initial = props.data ?? null;

const modification = !!initial;

const url = ref(initial?.url ?? "");
const name = ref(initial?.name ?? "");

/** The project's own, plus those its scopings already use. */
const tags = computed(() => store.linkTags());

function tagLabel(tag: string): string {
  return LINK_TAG_LABEL[tag] ?? tag;
}

/**
 * What the field shows: the label, not the key.
 *
 * Choosing « Carte Trello » from the list only to see « carte_trello » written in would suggest the input had been corrected. The form written in the frontmatter is recovered by normalisation, which precisely gives back the original key for any known label.
 */
const tag = ref(tagLabel(initial?.tag || tags.value[0] || "document"));

/**
 * The offered kinds, filtered by what is typed.
 *
 * The filter applies to the normalised kind and to its label: one searches for « Carte Trello » as read on the page, not as written in the frontmatter. The whole list stays on offer as long as the field holds a known kind — otherwise selecting one suggestion would hide all the others, and changing one's mind would require erasing everything.
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
 * The kind as it will be written in the frontmatter.
 *
 * Accents folded, separators unified into underscores, case lowered: the kind is a key, and « Ticket Jira » typed here must not found a second kind next to the « ticket_jira » already used elsewhere. It is also what brings the label shown in the field back to the key it designates — « Carte Trello » gives back « carte_trello ».
 */
const normalizedTag = computed(() => normalizeTag(tag.value));

const tagError = computed(() => {
  if (!tag.value.trim()) return null;
  return normalizedTag.value
    ? null
    : "Une nature s’écrit avec des lettres ou des chiffres.";
});

/**
 * An absolute http(s) address, and nothing else.
 *
 * A relative path or a `javascript:` makes no sense here: the former would not resolve from the repo, the latter would turn the frontmatter into an execution vector for anyone opening the page.
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
 * The name is not required.
 *
 * Links written before the field existed carry none, and the page names them by their kind: requiring it here would make those links impossible to correct without inventing a label for them along the way.
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
    <!-- The hint carries the error without putting the field in error: that is how SSK Canon displayed it, through a class on its mat-hint. -->
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
/* SSK Canon also set `padding-top: 8px` here, which Material's « title + content » rule cancelled through its specificity: the content therefore starts flush with the title, and the gap is not reproduced here. */
.lien-dialog :deep(.ui-dialogue__contenu) {
  display: flex;
  flex-direction: column;
  min-width: min(420px, 78vw);
}
</style>
