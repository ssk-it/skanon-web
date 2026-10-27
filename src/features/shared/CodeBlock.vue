<script lang="ts">
/** The languages the application displays. */
export type CodeLanguage = "bash" | "yaml" | "json";

interface Fragment {
  readonly text: string;
  readonly className: string;
}

/**
 * Splits a line into coloured fragments.
 *
 * Minimal highlighting, written here rather than brought in by a library: three languages, and only what helps reading — a comment one skips, a key one looks for, a value one copies. A highlighting library would weigh more than what it colours.
 */
function split(line: string, language: CodeLanguage): readonly Fragment[] {
  const comment = language === "json" ? null : line.indexOf("#");
  if (comment !== null && comment >= 0 && !inString(line, comment)) {
    return [
      ...split(line.slice(0, comment), language),
      { text: line.slice(comment), className: "commentaire" },
    ];
  }

  if (language === "yaml") return splitYaml(line);
  if (language === "json") return splitJson(line);
  return splitBash(line);
}

/** A `#` inside quotes does not open a comment. */
function inString(line: string, position: number): boolean {
  let quotes = 0;
  for (let i = 0; i < position; i++) {
    if (line[i] === '"' || line[i] === "'") quotes++;
  }
  return quotes % 2 === 1;
}

function splitYaml(line: string): readonly Fragment[] {
  // `cle:` at the start of a line or after a dash, up to the colon.
  const m = /^(\s*(?:-\s*)?)([\w.-]+)(:)(.*)$/.exec(line);
  if (m) {
    return [
      { text: m[1], className: "" },
      { text: m[2], className: "cle" },
      { text: m[3], className: "ponctuation" },
      { text: m[4], className: "valeur" },
    ];
  }
  return [{ text: line, className: "" }];
}

function splitJson(line: string): readonly Fragment[] {
  const fragments: Fragment[] = [];
  // Strings first: a key is a string followed by a colon.
  const re = /"(?:[^"\\]|\\.)*"|[{}[\],:]/g;
  let last = 0;
  for (const m of line.matchAll(re)) {
    const i = m.index ?? 0;
    if (i > last) fragments.push({ text: line.slice(last, i), className: "" });
    const remainder = line.slice(i + m[0].length).trimStart();
    fragments.push({
      text: m[0],
      className: m[0].startsWith('"')
        ? remainder.startsWith(":")
          ? "cle"
          : "valeur"
        : "ponctuation",
    });
    last = i + m[0].length;
  }
  if (last < line.length)
    fragments.push({ text: line.slice(last), className: "" });
  return fragments.length ? fragments : [{ text: line, className: "" }];
}

function splitBash(line: string): readonly Fragment[] {
  // The command is the first word; options are spotted by their dash.
  const m = /^(\s*)([\w./-]+)/.exec(line);
  if (!m) return [{ text: line, className: "" }];

  const rest: Fragment[] = [];
  const re = /(\s)(--?[\w-]+)/g;
  let last = 0;
  const remainder = line.slice(m[0].length);
  for (const o of remainder.matchAll(re)) {
    const i = o.index ?? 0;
    if (i > last) rest.push({ text: remainder.slice(last, i), className: "" });
    rest.push({ text: o[1], className: "" });
    rest.push({ text: o[2], className: "option" });
    last = i + o[0].length;
  }
  if (last < remainder.length)
    rest.push({ text: remainder.slice(last), className: "" });

  return [
    { text: m[1], className: "" },
    { text: m[2], className: "commande-nom" },
    ...rest,
  ];
}
</script>

<script setup lang="ts">
import { computed } from "vue";
import { trimTrailing } from "../../core/text";

/**
 * A displayed code block, coloured according to its language.
 *
 * The text stays selectable and copyable as is: highlighting inserts no character, only tags around what exists.
 */
const props = defineProps<{ text: string; language: CodeLanguage }>();

const lines = computed(() =>
  trimTrailing(props.text, "\n")
    .split("\n")
    .map((l) => split(l, props.language)),
);
</script>

<!-- Focusable: a block wider than its column scrolls, and without focus the keyboard would not scroll it (RG-accessibilite-aa, 2.1.1). -->
<!-- prettier-ignore -->
<template>
  <pre class="bloc-code bloc" tabindex="0"><code><span v-for="(l, i) in lines" :key="i" class="ligne"><span v-for="(f, j) in l" :key="j" :class="f.className">{{ f.text }}</span></span></code></pre>
</template>

<style scoped>
.bloc {
  margin: 0 0 6px;
  padding: 11px 13px;
  border-radius: 8px;
  background: var(--mat-sys-surface-container-high);
  color: var(--mat-sys-on-surface);
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12.5px;
  line-height: 1.65;
  overflow-x: auto;
}
.bloc:focus-visible {
  outline: 2px solid var(--mat-sys-primary);
  outline-offset: 2px;
}
code {
  font: inherit;
}
.ligne {
  display: block;
  white-space: pre;
}
/* Enough contrast to distinguish, little enough not to shout: what one reads here is text to copy, not a program to go through. */
.commentaire {
  color: var(--mat-sys-on-surface-variant);
  font-style: italic;
}
.cle {
  color: var(--mat-sys-primary);
}
.commande-nom {
  color: var(--mat-sys-primary);
  font-weight: 600;
}
.option {
  color: var(--mat-sys-tertiary);
}
.valeur {
  color: var(--mat-sys-on-surface);
}
.ponctuation {
  color: var(--mat-sys-on-surface-variant);
}
</style>
