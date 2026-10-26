<script lang="ts">
/**
 * A piece of a catalogue phrase: plain text, a strong word, or a link opened in the user's browser.
 *
 * A phrase with inline markup is written as a list of pieces rather than as HTML: catalogue text never goes through `v-html`, and each language orders its pieces as its grammar wants.
 */
export type RichPart =
  | string
  | { readonly strong: string }
  | { readonly link: string; readonly text: string };
</script>

<script setup lang="ts">
import ExternalLink from "../../ui/ExternalLink.vue";
import UiIcon from "../../ui/UiIcon.vue";

/**
 * Renders a phrase written as pieces, inline, inside the element that holds it.
 *
 * ```vue
 * <p><RichText :parts="t().why" /></p>
 * ```
 */
defineProps<{ parts: readonly RichPart[] }>();
</script>

<template>
  <template v-for="(p, i) in parts" :key="i">
    <template v-if="typeof p === 'string'">{{ p }}</template>
    <strong v-else-if="'strong' in p">{{ p.strong }}</strong>
    <ExternalLink v-else :href="p.link"
      >{{ p.text }} <UiIcon name="open_in_new"
    /></ExternalLink>
  </template>
</template>
