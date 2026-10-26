<script setup lang="ts">
/**
 * Une icône de la police Material Symbols Outlined, embarquée par `main.ts`.
 *
 * `<UiIcone nom="search" />` rend `<span class="material-symbols-outlined">search</span>` : la ligature de la police fait du nom l'image. La boîte est celle de `mat-icon` — 24 px de côté (`src/styles.css`) ; une vue qui la veut plus petite redéfinit `font-size`, `width` et `height` sur `.material-symbols-outlined`, comme elle le faisait sur `mat-icon`.
 *
 * Décorative, comme `mat-icon` : `aria-hidden` d'office. Un bouton qui n'a qu'une icône porte son nom par `aria-label`.
 */
defineProps<{ nom: string }>();
</script>

<template>
  <span class="material-symbols-outlined" aria-hidden="true">{{ nom }}</span>
</template>
