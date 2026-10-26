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
 * A project's symbol, wherever the application designates it.
 *
 * It takes the variant of the theme actually applied, not the system's: when the author forces a theme, the symbol follows. With no symbol for this background, the fallback — the organisation's avatar, or the folder icon on the home page — takes the same place, so that nothing shifts. See RG-identite-affichee.
 *
 * The symbol's colours are its own: the application neither chooses nor tints them (RG-couleur-porteuse). It is decorative for those who do not see it, the project name always being written next to it.
 *
 * The root element is `span.symbole-projet`: it is what a view targets to place the symbol, as it targeted `pc-symbole-projet`.
 */
const props = withDefaults(
  defineProps<{
    repoRef: RepoRef;
    /** Side of the box, in display pixels. */
    size?: number;
    /** What shows without a symbol: the avatar, a Material icon, or nothing. */
    fallback?: "avatar" | "folder" | "folder_open" | "aucun";
    /**
     * The background the symbol sits on, when it does not follow the theme — the bar's brand, dark in both. The variant is chosen from the background: that is how the identity names them.
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

// Failure belongs to an image, not to the component: a symbol replaced in the repo must get its chance rather than keep the previous one's fallback.
const failed = ref(false);
watch(read, () => (failed.value = false));

const source = computed(() => (failed.value ? null : read.value));
const empty = computed(() => !source.value && props.fallback === "aucun");

watchEffect(() => {
  // Read so as to be tracked: a return to the home page or a withdrawn access asks for the identity again.
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
/* Without a fallback, the space is not reserved: it did not exist before the symbol, and nothing shifts into it. */
.symbole-projet.vide {
  display: none;
}
/* A symbol is not always square: it fits in the box without being cropped or distorted. */
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
