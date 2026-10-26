<script setup lang="ts">
import { computed, ref, watch, watchEffect } from "vue";
import type { RefDepot } from "../../core/github/github-client";
import { inject } from "../../core/injection";
import type { VarianteIdentite } from "../../core/repo/identite-noms";
import { IdentitesService } from "../../core/repo/identites.service";
import { ThemeService } from "../../core/ui/theme.service";
import UiIcone from "../../ui/UiIcone.vue";
import AvatarOrganisation from "./AvatarOrganisation.vue";

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
    depot: RefDepot;
    /** Côté de la case, en pixels d'affichage. */
    taille?: number;
    /** Ce qui se montre sans symbole : l'avatar, une icône de Material, ou rien. */
    repli?: "avatar" | "folder" | "folder_open" | "aucun";
    /**
     * Le fond sur lequel le symbole se pose, quand il ne suit pas le thème — la marque de la barre, sombre dans les deux. La variante se choisit d'après le fond : c'est ainsi que l'identité les nomme.
     */
    fond?: VarianteIdentite | null;
  }>(),
  { taille: 18, repli: "avatar", fond: null },
);

const identites = inject(IdentitesService);
const theme = inject(ThemeService);

const variante = computed(() => props.fond ?? theme.effectif());

const lue = computed(() => identites.findSymbole(props.depot, variante.value));

// L'échec appartient à une image, pas au composant : un symbole remplacé dans le dépôt doit avoir sa chance plutôt que garder le repli du précédent.
const echoue = ref(false);
watch(lue, () => (echoue.value = false));

const source = computed(() => (echoue.value ? null : lue.value));
const vide = computed(() => !source.value && props.repli === "aucun");

watchEffect(() => {
  // Lue pour être suivie : un retour à l'accueil ou un accès retiré redemande l'identité.
  identites.generation();
  void identites.demander(props.depot, variante.value);
});
</script>

<template>
  <span
    class="symbole-projet"
    :class="{ vide }"
    :style="{
      '--taille-symbole': `${taille}px`,
      '--taille-avatar': `${taille}px`,
    }"
  >
    <img
      v-if="source"
      class="symbole"
      :src="source"
      alt=""
      aria-hidden="true"
      decoding="async"
      @error="echoue = true"
    />
    <AvatarOrganisation
      v-else-if="repli === 'avatar'"
      :owner="depot.owner"
      :taille="taille"
    />
    <UiIcone v-else-if="repli !== 'aucun'" :nom="repli" />
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
