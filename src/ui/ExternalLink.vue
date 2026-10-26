<script setup lang="ts">
import { inject } from "../core/injection";
import { PLATFORM } from "../platform/platform-token";

/**
 * A link to an address outside the application — github.com, a card, an issue.
 *
 * In the desktop application, a `target="_blank"` leads nowhere: the embedded web view does not open a new tab. The click therefore goes through the platform's opener, which hands the address to the user's browser. The real `href` stays: the link announces itself as such, can be copied, and still opens on middle click in the web version.
 *
 * ```vue
 * <ExternalLink href="https://github.com/settings/tokens">les réglages GitHub</ExternalLink>
 * ```
 *
 * Any other attribute (`class`, `title`, `aria-label`) passes to the `<a>` element.
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
