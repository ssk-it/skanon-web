<script setup lang="ts">
import DOMPurify from "dompurify";
import { onMounted, ref, watch } from "vue";
import { inject } from "../../core/injection";
import { ThemeService } from "../../core/ui/theme.service";
import { extraireDiagrammes, themeMermaid } from "./diagramme";
import { rendreMarkdown } from "./markdown";

/**
 * Affiche du Markdown, en dessinant les diagrammes qu'il contient.
 *
 * Un composant plutôt qu'une fonction : le rendu d'un diagramme est asynchrone — le moteur n'est chargé qu'à la demande — et une fonction rend une valeur, elle n'attend pas.
 *
 * Le moteur n'est importé que si la page en contient un. Une page sans diagramme ne paie donc rien de plus qu'avant, ce que l'import dynamique est seul à garantir : un import ordinaire le mettrait dans le paquet principal, chargé partout.
 *
 * L'élément racine est `div.markdown-rendu`, l'hôte `pc-markdown` de SSK Canon.
 */
const props = defineProps<{ texte?: string | null }>();

const theme = inject(ThemeService);
const hote = ref<HTMLElement | null>(null);

onMounted(() => {
  // Le thème est suivi ici, non lu dans `rendre` : une bascule redessine les diagrammes. Un thème lu au moment du rendu seul laisserait les schémas déjà affichés dans l'ancien.
  watch(
    [() => props.texte, () => theme.effectif()],
    ([valeur, effectif]) => void rendre(valeur ?? "", effectif),
    { immediate: true },
  );
});

async function rendre(
  texte: string,
  effectif: "clair" | "sombre",
): Promise<void> {
  const element = hote.value;
  if (!element) return;
  if (!texte.trim()) {
    element.innerHTML = "";
    return;
  }

  const html = rendreMarkdown(texte);
  const diagrammes = extraireDiagrammes(html);

  // Rien à dessiner : on s'arrête avant de charger quoi que ce soit.
  if (!diagrammes.length) {
    element.innerHTML = html;
    return;
  }

  element.innerHTML = diagrammes[diagrammes.length - 1].html;

  const mermaid = await chargerMoteur(effectif);
  for (const d of diagrammes) {
    const cible = element.querySelector(`[data-diagramme="${d.id}"]`);
    if (!cible) continue;
    try {
      const { svg } = await mermaid.render(`mermaid-${d.id}`, d.source);
      // Le moteur produit du balisage à partir d'un texte que l'application ne contrôle pas : il passe par le même assainissement que le reste.
      cible.innerHTML = DOMPurify.sanitize(svg, {
        USE_PROFILES: { svg: true, svgFilters: true },
      });
      rendreAgrandissable(cible as HTMLElement);
    } catch (e) {
      cible.outerHTML = messageErreur(e);
    }
  }
}
</script>

<script lang="ts">
/**
 * Le moteur, chargé une fois et partagé.
 *
 * Deux diagrammes sur une même page, ou deux pages successives, ne doivent pas déclencher deux chargements : le module est mis en cache par le navigateur, mais l'initialisation ne l'est pas.
 */
let moteur: Promise<typeof import("mermaid").default> | null = null;
let themeApplique: "clair" | "sombre" | null = null;

async function chargerMoteur(effectif: "clair" | "sombre") {
  moteur ??= import("mermaid").then((m) => m.default);
  const mermaid = await moteur;

  // `initialize` est global au moteur : le rappeler au changement de thème est ce qui fait suivre les diagrammes, et le rappeler sans changement réinitialiserait inutilement un état partagé.
  if (themeApplique !== effectif) {
    mermaid.initialize({
      startOnLoad: false,
      // `loose` autoriserait les clics et le HTML dans les libellés, sur un texte venu d'un dépôt. `strict` est le seul mode compatible avec le fait que ce contenu n'est pas contrôlé.
      securityLevel: "strict",
      theme: themeMermaid(effectif),
      // Les libellés sont dessinés en SVG, non en HTML dans un `foreignObject`.
      //
      // DOMPurify retire `foreignObject` — c'est du HTML injecté au milieu d'un SVG, et sa suppression est délibérée. Les diagrammes s'affichaient donc complets et muets : des formes sans texte, ce qu'on prend pour le schéma voulu plutôt que pour un défaut.
      //
      // Affaiblir l'assainissement serait la mauvaise réponse : le texte vient d'un dépôt que l'application ne contrôle pas. `htmlLabels` se règle globalement autant que par type : le rendu récent du moteur ne lit pas toujours l'option propre au diagramme.
      htmlLabels: false,
      flowchart: { htmlLabels: false },
      class: { htmlLabels: false },
    });
    themeApplique = effectif;
  }
  return mermaid;
}

/**
 * Rend un diagramme agrandissable.
 *
 * Le moteur contraint le SVG à sa largeur « naturelle » — quelques centaines de pixels pour un flux de quelques nœuds —, ce qui le rend illisible dès qu'il porte du texte. L'agrandissement le montre à la taille de l'écran.
 *
 * Un survol et un rôle de bouton plutôt qu'une icône : la cible du clic est le diagramme entier, et rien n'indiquerait mieux qu'il est cliquable qu'un curseur qui change dessus.
 */
function rendreAgrandissable(cible: HTMLElement): void {
  cible.classList.add("pc-diagramme-cliquable");
  cible.setAttribute("role", "button");
  cible.setAttribute("tabindex", "0");
  cible.setAttribute("title", "Agrandir le diagramme");

  const ouvrir = () => agrandir(cible.innerHTML);
  cible.addEventListener("click", ouvrir);
  cible.addEventListener("keydown", (e) => {
    // Au clavier, ce qu'on attend d'un élément annoncé comme un bouton.
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      ouvrir();
    }
  });
}

/**
 * Ouvre un diagramme en grand, par-dessus la page.
 *
 * Le contenu est celui déjà assaini et affiché : le réassainir ne changerait rien, le régénérer ferait dépendre l'agrandissement d'un second rendu qui pourrait différer.
 */
function agrandir(svgAssaini: string): void {
  const fond = document.createElement("div");
  fond.className = "pc-diagramme-agrandi";
  fond.innerHTML = `<div class="pc-diagramme-agrandi-contenu">${svgAssaini}</div>`;

  const fermer = () => {
    fond.remove();
    document.removeEventListener("keydown", surTouche);
  };
  const surTouche = (e: KeyboardEvent) => {
    if (e.key === "Escape") fermer();
  };

  // Le fond referme, le contenu non : cliquer sur le diagramme agrandi pour le regarder de plus près ne doit pas le faire disparaître.
  fond.addEventListener("click", (e) => {
    if (e.target === fond) fermer();
  });
  document.addEventListener("keydown", surTouche);

  document.body.appendChild(fond);
}

/**
 * Ce qu'un diagramme fautif laisse voir — RG-diagrammes-rendus.
 *
 * À l'endroit où il devait paraître, et sans emporter la page : un schéma illustre un propos, il ne le porte pas.
 */
function messageErreur(e: unknown): string {
  const cause = e instanceof Error ? e.message : String(e);
  const propre = DOMPurify.sanitize(cause, {
    ALLOWED_TAGS: [],
    ALLOWED_ATTR: [],
  });
  return `<div class="pc-diagramme-erreur">Ce diagramme n’a pas pu être dessiné : <code>${propre}</code></div>`;
}
</script>

<template>
  <div ref="hote" class="markdown-rendu"></div>
</template>

<style>
/* Global : le HTML est posé par `innerHTML`, hors de portée des styles d'un composant. */
.markdown-rendu {
  display: block;
}
.pc-diagramme {
  display: flex;
  justify-content: center;
  margin: 16px 0;

  svg {
    max-width: 100%;
    height: auto;
  }
}
.pc-diagramme-cliquable {
  cursor: zoom-in;
  border-radius: 4px;

  &:hover,
  &:focus-visible {
    outline: 1px solid var(--mat-sys-outline-variant);
    outline-offset: 4px;
  }
}
.pc-diagramme-erreur {
  margin: 16px 0;
  padding: 10px 12px;
  border-left: 3px solid var(--mat-sys-error);
  font-size: 13px;
  color: var(--mat-sys-on-surface-variant);

  code {
    font-family: var(--pc-mono);
    font-size: 12px;
  }
}
</style>
