<script setup lang="ts">
import { computed, ref, watch } from "vue";

/**
 * L'avatar de l'organisation (ou du compte) qui porte un dépôt.
 *
 * Servi par `avatars.githubusercontent.com`, qui n'est décompté d'aucun quota d'API : l'identité visuelle d'un dépôt ne coûte donc pas une des soixante requêtes horaires. `?s=` demande la taille juste, le CDN se chargeant du redimensionnement.
 *
 * Un avatar qui n'arrive pas — compte supprimé, réseau coupé, bloqueur — ne doit rien casser : le repli est une pastille portant l'initiale, de la même taille, pour que la liste ne se décale pas.
 */
const props = withDefaults(
  defineProps<{
    owner: string;
    /** Côté demandé au CDN, en pixels d'affichage. */
    size?: number;
  }>(),
  { size: 18 },
);

const url = computed(() => {
  // Demander le double sur un écran dense coûte peu et évite un avatar flou ; au-delà de 3 le gain n'est plus visible.
  const side = Math.round(props.size * Math.min(devicePixelRatio || 1, 3));
  return `https://avatars.githubusercontent.com/${encodeURIComponent(props.owner)}?s=${side}`;
});

// L'échec appartient à une URL, pas au composant : changer de dépôt doit redonner sa chance à l'image plutôt que garder le repli du précédent.
const failed = ref(false);
watch(url, () => (failed.value = false));

const initialValue = computed(() => props.owner.charAt(0));
</script>

<template>
  <span class="avatar-organisation">
    <span v-if="failed" class="repli" aria-hidden="true">{{
      initialValue
    }}</span>
    <img
      v-else
      class="avatar"
      :src="url"
      alt=""
      loading="lazy"
      decoding="async"
      referrerpolicy="no-referrer"
      @error="failed = true"
    />
  </span>
</template>

<style scoped>
.avatar-organisation {
  display: inline-flex;
  flex: none;
}
.avatar,
.repli {
  width: var(--taille-avatar, 18px);
  height: var(--taille-avatar, 18px);
  border-radius: 50%;
  object-fit: cover;
}
.repli {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: var(--mat-sys-surface-container-highest);
  color: var(--mat-sys-on-surface-variant);
  font-size: calc(var(--taille-avatar, 18px) * 0.58);
  font-weight: 600;
  line-height: 1;
  text-transform: uppercase;
}
</style>
