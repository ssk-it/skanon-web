<script setup lang="ts">
import { inject } from "../core/injection";
import { PLATFORM } from "../plateforme/jeton";

/**
 * Un lien vers une adresse hors de l'application — github.com, une carte, une issue.
 *
 * Dans l'application de bureau, un `target="_blank"` ne mène nulle part : la vue web intégrée n'ouvre pas de nouvel onglet. Le clic passe donc par l'ouvreur de la plateforme, qui confie l'adresse au navigateur de l'utilisateur. Le vrai `href` reste : le lien s'annonce comme tel, se copie, et s'ouvre encore au clic du milieu dans la version web.
 *
 * ```vue
 * <LienExterne href="https://github.com/settings/tokens">les réglages GitHub</LienExterne>
 * ```
 *
 * Tout autre attribut (`class`, `title`, `aria-label`) passe à l'élément `<a>`.
 */
const props = defineProps<{ href: string }>();

const opener = inject(PLATFORM).opener;

function open(event: MouseEvent): void {
  event.preventDefault();
  void opener.open(props.href);
}
</script>

<template>
  <a :href="href" target="_blank" rel="noopener noreferrer" @click="open">
    <slot />
  </a>
</template>
