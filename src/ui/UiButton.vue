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
 * The Material 3 button, without Material.
 *
 * | Variant    | Replaces                                     |
 * | ---------- | -------------------------------------------- |
 * | `text`     | `matButton`, `mat-button` (the default)      |
 * | `filled`   | `matButton="filled"`, `mat-flat-button`      |
 * | `tonal`    | `matButton="tonal"`                          |
 * | `outlined` | `matButton="outlined"`, `mat-stroked-button` |
 * | `icon`     | `matIconButton`, `mat-icon-button`           |
 *
 * ```vue
 * <UiButton variant="filled" @click="validate()">Enregistrer</UiButton>
 * <UiButton variant="icon" aria-label="Recharger" @click="reload()"><UiIcon name="refresh" /></UiButton>
 * <UiButton :to="links.path('reglages')" active-class="actif">Réglages</UiButton>
 * <UiButton href="https://github.com/…">Ouvrir sur GitHub</UiButton>
 * ```
 *
 * A `<button type="button">` by default: a button placed in a form only submits it when asked to (`type="submit"`). With `to`, it is a `RouterLink`; with `href`, an `ExternalLink`, opened in the user's browser.
 *
 * As in Material, the content's `UiIcon`s leave the label and are placed in front of it, at 18 px, and the button tightens its padding on that side. The label is `.ui-bouton__libelle`: a view that must truncate it targets it with `:deep(.ui-bouton__libelle)`, as it targeted `.mdc-button__label`.
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

/** The nodes of a slot, without the fragments `v-if` and `v-for` leave in it. */
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

/* The state layer: the text colour, at the opacity Material 3 gives to hover, focus and press. */
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

/* Above the state layer, which is positioned. */
.ui-bouton > .material-symbols-outlined {
  position: relative;
}

/* The icon that precedes a label. An icon button keeps its own at 24 px and centred: shrunk and pulled to the left, it went outside the disc of its state layer. */
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
