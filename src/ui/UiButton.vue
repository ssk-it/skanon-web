<script setup lang="ts">
import {
  Comment,
  Fragment,
  computed,
  useSlots,
  type FunctionalComponent,
  type VNode,
} from "vue";
import { RouterLink, type RouteLocationRaw } from "vue-router";
import ExternalLink from "./ExternalLink.vue";
import UiIcon from "./UiIcon.vue";

/**
 * Le bouton de Material 3, sans Material.
 *
 * | Variante   | Remplace                                     |
 * | ---------- | -------------------------------------------- |
 * | `text`     | `matButton`, `mat-button` (le défaut)        |
 * | `filled`   | `matButton="filled"`, `mat-flat-button`      |
 * | `tonal`    | `matButton="tonal"`                          |
 * | `outlined` | `matButton="outlined"`, `mat-stroked-button` |
 * | `icon`     | `matIconButton`, `mat-icon-button`           |
 *
 * ```vue
 * <UiBouton variante="filled" @click="valider()">Enregistrer</UiBouton>
 * <UiBouton variante="icon" aria-label="Recharger" @click="recharger()"><UiIcone nom="refresh" /></UiBouton>
 * <UiBouton :to="liens.chemin('reglages')" active-class="actif">Réglages</UiBouton>
 * <UiBouton href="https://github.com/…">Ouvrir sur GitHub</UiBouton>
 * ```
 *
 * Un `<button type="button">` d'office : un bouton posé dans un formulaire ne le soumet que si on le demande (`type="submit"`). Avec `to`, c'est un `RouterLink` ; avec `href`, un `LienExterne`, ouvert dans le navigateur de l'utilisateur.
 *
 * Comme chez Material, les `UiIcone` du contenu sortent du libellé et se placent devant lui, à 18 px, et le bouton resserre sa marge de ce côté. Le libellé est `.ui-bouton__libelle` : une vue qui doit le tronquer le vise par `:deep(.ui-bouton__libelle)`, comme elle visait `.mdc-button__label`.
 */
const props = withDefaults(
  defineProps<{
    variant?: "text" | "filled" | "tonal" | "outlined" | "icon";
    type?: "button" | "submit" | "reset";
    disabled?: boolean;
    to?: RouteLocationRaw;
    href?: string;
  }>(),
  {
    variant: "text",
    type: "button",
    disabled: false,
    to: undefined,
    href: undefined,
  },
);

const slots = useSlots();

/** Les nœuds d'un emplacement, sans les fragments que `v-if` et `v-for` y laissent. */
function flatten(nodes: readonly VNode[]): VNode[] {
  return nodes.flatMap((n) =>
    n.type === Fragment && Array.isArray(n.children)
      ? flatten(n.children as VNode[])
      : n.type === Comment
        ? []
        : [n],
  );
}

function parts(): { icons: VNode[]; rest: VNode[] } {
  const everything = flatten(slots.default?.() ?? []);
  if (props.variant === "icon") return { icons: [], rest: everything };
  return {
    icons: everything.filter((n) => n.type === UiIcon),
    rest: everything.filter((n) => n.type !== UiIcon),
  };
}

const Nodes: FunctionalComponent<{ n: VNode[] }> = (p) => p.n;

const element = computed(() =>
  props.to !== undefined ? RouterLink : props.href ? ExternalLink : "button",
);

const bindings = computed(() => {
  if (props.to !== undefined)
    return {
      to: props.to,
      "aria-disabled": props.disabled || undefined,
      tabindex: props.disabled ? -1 : undefined,
    };
  if (props.href)
    return {
      href: props.href,
      "aria-disabled": props.disabled || undefined,
      tabindex: props.disabled ? -1 : undefined,
    };
  return { type: props.type, disabled: props.disabled };
});
</script>

<template>
  <component
    :is="element"
    class="ui-bouton"
    :class="[
      `ui-bouton--${variant}`,
      {
        'ui-bouton--desactive': disabled,
        'ui-bouton--avec-icone': parts().icons.length > 0,
      },
    ]"
    v-bind="bindings"
  >
    <template v-if="variant === 'icon'"><slot /></template>
    <template v-else>
      <Nodes :n="parts().icons" />
      <span class="ui-bouton__libelle"><Nodes :n="parts().rest" /></span>
    </template>
  </component>
</template>

<style>
.ui-bouton {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  height: 40px;
  min-width: 64px;
  padding: 0 12px;
  margin: 0;
  border: none;
  border-radius: 9999px;
  outline: none;
  background: transparent;
  color: var(--mat-sys-primary);
  font-family: Roboto, sans-serif;
  font-size: 0.875rem;
  font-weight: 500;
  letter-spacing: 0.006rem;
  line-height: inherit;
  text-decoration: none;
  vertical-align: middle;
  white-space: nowrap;
  user-select: none;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  -webkit-appearance: none;
  appearance: none;
}

/* Le calque d'état : la couleur du texte, à l'opacité que Material 3 donne au survol, au focus et à l'appui. */
.ui-bouton::before {
  content: "";
  position: absolute;
  inset: 0;
  border-radius: inherit;
  background: currentColor;
  opacity: 0;
  pointer-events: none;
  transition: opacity 15ms linear;
}
.ui-bouton:hover::before {
  opacity: 0.08;
}
.ui-bouton:focus-visible::before,
.ui-bouton:active::before {
  opacity: 0.12;
}

.ui-bouton__libelle {
  position: relative;
}

/* Au-dessus du calque d'état, qui est positionné. */
.ui-bouton > .material-symbols-outlined {
  position: relative;
}

/* L'icône qui précède un libellé. Un bouton d'icône garde la sienne à 24 px et centrée : réduite et tirée vers la gauche, elle sortait du disque de son calque d'état. */
.ui-bouton:not(.ui-bouton--icon) > .material-symbols-outlined {
  font-size: 1.125rem;
  width: 1.125rem;
  height: 1.125rem;
  margin-right: 8px;
  margin-left: -8px;
}

.ui-bouton--text.ui-bouton--avec-icone {
  padding: 0 16px;
}
.ui-bouton--text > .material-symbols-outlined {
  margin-left: -4px;
}

.ui-bouton--filled,
.ui-bouton--tonal,
.ui-bouton--outlined {
  padding: 0 24px;
}

.ui-bouton--filled {
  background: var(--mat-sys-primary);
  color: var(--mat-sys-on-primary);
}

.ui-bouton--tonal {
  background: var(--mat-sys-secondary-container);
  color: var(--mat-sys-on-secondary-container);
}

.ui-bouton--outlined {
  border: 1px solid var(--mat-sys-outline);
}

.ui-bouton--icon {
  min-width: 0;
  width: 40px;
  height: 40px;
  padding: 8px;
  flex-shrink: 0;
  border-radius: 50%;
  color: var(--mat-sys-on-surface-variant);
  font-size: 24px;
}

.ui-bouton--desactive {
  cursor: default;
  pointer-events: none;
  color: color-mix(in srgb, var(--mat-sys-on-surface) 38%, transparent);
}
.ui-bouton--desactive.ui-bouton--filled,
.ui-bouton--desactive.ui-bouton--tonal {
  background: color-mix(in srgb, var(--mat-sys-on-surface) 12%, transparent);
}
.ui-bouton--desactive.ui-bouton--outlined {
  border-color: color-mix(in srgb, var(--mat-sys-on-surface) 12%, transparent);
}
</style>
