<script setup lang="ts">
import { computed, ref, watch, watchEffect } from "vue";
import type { RepoRef } from "../../core/github/github-client";
import { inject } from "../../core/injection";
import type { IdentityVariant } from "../../core/repo/identity-names";
import { ProjectIdentityService } from "../../core/repo/project-identity.service";
import { ThemeService } from "../../core/ui/theme.service";
import UiIcon from "../../ui/UiIcon.vue";
import OrganizationAvatar from "./OrganizationAvatar.vue";

/**
 * Le symbole d'un projet, là où l'application le désigne.
 *
 * Il prend la variante du thème réellement appliqué, non celui du système : quand le rédacteur force un thème, le symbole le suit. Sans symbole pour ce fond, le repli — l'avatar de l'organisation, ou l'icône de dossier sur l'accueil — occupe la même place, pour que rien ne se décale. Voir RG-identite-affichee.
 *
 * Les couleurs du symbole sont les siennes : l'application ne les choisit ni ne les teinte (RG-couleur-porteuse). Il est décoratif pour qui ne le voit pas, le nom du projet étant toujours écrit à côté.
 *
 * L'élément racine est `span.symbole-projet` : c'est lui qu'une vue vise pour placer le symbole, comme elle visait `pc-symbole-projet`.
 */
const props = withDefaults(
  defineProps<{
    repoRef: RepoRef;
    /** Côté de la case, en pixels d'affichage. */
    size?: number;
    /** Ce qui se montre sans symbole : l'avatar, une icône de Material, ou rien. */
    fallback?: "avatar" | "folder" | "folder_open" | "aucun";
    /**
     * Le fond sur lequel le symbole se pose, quand il ne suit pas le thème — la marque de la barre, sombre dans les deux. La variante se choisit d'après le fond : c'est ainsi que l'identité les nomme.
     */
    background?: IdentityVariant | null;
  }>(),
  { size: 18, fallback: "avatar", background: null },
);

const identities = inject(ProjectIdentityService);
const theme = inject(ThemeService);

const variant = computed(() => props.background ?? theme.effective());

const read = computed(() =>
  identities.findSymbol(props.repoRef, variant.value),
);

// L'échec appartient à une image, pas au composant : un symbole remplacé dans le dépôt doit avoir sa chance plutôt que garder le repli du précédent.
const failed = ref(false);
watch(read, () => (failed.value = false));

const source = computed(() => (failed.value ? null : read.value));
const empty = computed(() => !source.value && props.fallback === "aucun");

watchEffect(() => {
  // Lue pour être suivie : un retour à l'accueil ou un accès retiré redemande l'identité.
  identities.generation();
  void identities.request(props.repoRef, variant.value);
});
</script>

<template>
  <span
    class="symbole-projet"
    :class="{ vide: empty }"
    :style="{
      '--taille-symbole': `${size}px`,
      '--taille-avatar': `${size}px`,
    }"
  >
    <img
      v-if="source"
      class="symbole"
      :src="source"
      alt=""
      aria-hidden="true"
      decoding="async"
      @error="failed = true"
    />
    <OrganizationAvatar
      v-else-if="fallback === 'avatar'"
      :owner="repoRef.owner"
      :size="size"
    />
    <UiIcon v-else-if="fallback !== 'aucun'" :name="fallback" />
  </span>
</template>

<style scoped>
.symbole-projet {
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: var(--taille-symbole);
  height: var(--taille-symbole);
}
/* Sans repli, la place n'est pas réservée : elle n'existait pas avant le symbole, et rien ne s'y décale. */
.symbole-projet.vide {
  display: none;
}
/* Un symbole n'est pas toujours carré : il tient dans la case sans être rogné ni déformé. */
.symbole {
  width: 100%;
  height: 100%;
  object-fit: contain;
}
.material-symbols-outlined {
  font-size: var(--taille-symbole);
  width: var(--taille-symbole);
  height: var(--taille-symbole);
  color: var(--mat-sys-on-surface-variant);
}
</style>
