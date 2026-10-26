<script lang="ts">
/** Les langages que l'application affiche. */
export type LangageCode = "bash" | "yaml" | "json";

interface Fragment {
  readonly texte: string;
  readonly classe: string;
}

/**
 * Découpe une ligne en fragments colorés.
 *
 * Une coloration minimale, écrite ici plutôt qu'apportée par une bibliothèque : trois langages, et seulement ce qui aide à lire — un commentaire qu'on saute, une clé qu'on cherche, une valeur qu'on recopie. Une bibliothèque de coloration pèserait plus que ce qu'elle colore.
 */
function decouper(ligne: string, langage: LangageCode): readonly Fragment[] {
  const commentaire = langage === "json" ? null : ligne.indexOf("#");
  if (
    commentaire !== null &&
    commentaire >= 0 &&
    !dansUneChaine(ligne, commentaire)
  ) {
    return [
      ...decouper(ligne.slice(0, commentaire), langage),
      { texte: ligne.slice(commentaire), classe: "commentaire" },
    ];
  }

  if (langage === "yaml") return decouperYaml(ligne);
  if (langage === "json") return decouperJson(ligne);
  return decouperBash(ligne);
}

/** Un `#` entre guillemets n'ouvre pas de commentaire. */
function dansUneChaine(ligne: string, position: number): boolean {
  let guillemets = 0;
  for (let i = 0; i < position; i++) {
    if (ligne[i] === '"' || ligne[i] === "'") guillemets++;
  }
  return guillemets % 2 === 1;
}

function decouperYaml(ligne: string): readonly Fragment[] {
  // `cle:` en début de ligne ou après un tiret, jusqu'aux deux-points.
  const m = /^(\s*(?:-\s*)?)([\w.-]+)(:)(.*)$/.exec(ligne);
  if (m) {
    return [
      { texte: m[1], classe: "" },
      { texte: m[2], classe: "cle" },
      { texte: m[3], classe: "ponctuation" },
      { texte: m[4], classe: "valeur" },
    ];
  }
  return [{ texte: ligne, classe: "" }];
}

function decouperJson(ligne: string): readonly Fragment[] {
  const fragments: Fragment[] = [];
  // Les chaînes d'abord : une clé est une chaîne suivie de deux-points.
  const re = /"(?:[^"\\]|\\.)*"|[{}[\],:]/g;
  let dernier = 0;
  for (const m of ligne.matchAll(re)) {
    const i = m.index ?? 0;
    if (i > dernier)
      fragments.push({ texte: ligne.slice(dernier, i), classe: "" });
    const suite = ligne.slice(i + m[0].length).trimStart();
    fragments.push({
      texte: m[0],
      classe: m[0].startsWith('"')
        ? suite.startsWith(":")
          ? "cle"
          : "valeur"
        : "ponctuation",
    });
    dernier = i + m[0].length;
  }
  if (dernier < ligne.length)
    fragments.push({ texte: ligne.slice(dernier), classe: "" });
  return fragments.length ? fragments : [{ texte: ligne, classe: "" }];
}

function decouperBash(ligne: string): readonly Fragment[] {
  // La commande est le premier mot ; les options se repèrent à leur tiret.
  const m = /^(\s*)([\w./-]+)(.*)$/.exec(ligne);
  if (!m) return [{ texte: ligne, classe: "" }];

  const reste: Fragment[] = [];
  const re = /(\s)(--?[\w-]+)/g;
  let dernier = 0;
  const suite = m[3];
  for (const o of suite.matchAll(re)) {
    const i = o.index ?? 0;
    if (i > dernier) reste.push({ texte: suite.slice(dernier, i), classe: "" });
    reste.push({ texte: o[1], classe: "" });
    reste.push({ texte: o[2], classe: "option" });
    dernier = i + o[0].length;
  }
  if (dernier < suite.length)
    reste.push({ texte: suite.slice(dernier), classe: "" });

  return [
    { texte: m[1], classe: "" },
    { texte: m[2], classe: "commande-nom" },
    ...reste,
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
const props = defineProps<{ texte: string; langage: LangageCode }>();

const lignes = computed(() =>
  props.texte
    .replace(/\n+$/, "")
    .split("\n")
    .map((l) => decouper(l, props.langage)),
);
</script>

<!-- prettier-ignore -->
<template>
  <pre class="bloc-code bloc"><code><span v-for="(l, i) in lignes" :key="i" class="ligne"><span v-for="(f, j) in l" :key="j" :class="f.classe">{{ f.texte }}</span></span></code></pre>
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
