<script lang="ts">
/** Les langages que l'application affiche. */
export type CodeLanguage = "bash" | "yaml" | "json";

interface Fragment {
  readonly text: string;
  readonly className: string;
}

/**
 * Découpe une ligne en fragments colorés.
 *
 * Une coloration minimale, écrite ici plutôt qu'apportée par une bibliothèque : trois langages, et seulement ce qui aide à lire — un commentaire qu'on saute, une clé qu'on cherche, une valeur qu'on recopie. Une bibliothèque de coloration pèserait plus que ce qu'elle colore.
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

/** Un `#` entre guillemets n'ouvre pas de commentaire. */
function inString(line: string, position: number): boolean {
  let quotes = 0;
  for (let i = 0; i < position; i++) {
    if (line[i] === '"' || line[i] === "'") quotes++;
  }
  return quotes % 2 === 1;
}

function splitYaml(line: string): readonly Fragment[] {
  // `cle:` en début de ligne ou après un tiret, jusqu'aux deux-points.
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
  // Les chaînes d'abord : une clé est une chaîne suivie de deux-points.
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
  // La commande est le premier mot ; les options se repèrent à leur tiret.
  const m = /^(\s*)([\w./-]+)(.*)$/.exec(line);
  if (!m) return [{ text: line, className: "" }];

  const rest: Fragment[] = [];
  const re = /(\s)(--?[\w-]+)/g;
  let last = 0;
  const remainder = m[3];
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

/**
 * Un bloc de code affiché, coloré selon son langage.
 *
 * Le texte reste sélectionnable et copiable tel quel : la coloration n'insère aucun caractère, seulement des balises autour de ce qui existe.
 */
const props = defineProps<{ text: string; language: CodeLanguage }>();

const lines = computed(() =>
  props.text
    .replace(/\n+$/, "")
    .split("\n")
    .map((l) => split(l, props.language)),
);
</script>

<!-- prettier-ignore -->
<template>
  <pre class="bloc-code bloc"><code><span v-for="(l, i) in lines" :key="i" class="ligne"><span v-for="(f, j) in l" :key="j" :class="f.className">{{ f.text }}</span></span></code></pre>
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
code {
  font: inherit;
}
.ligne {
  display: block;
  white-space: pre;
}
/* Assez de contraste pour distinguer, assez peu pour ne pas crier : ce qu'on lit ici est du texte à recopier, non un programme à parcourir. */
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
