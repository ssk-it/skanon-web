<script setup lang="ts">
/**
 * Une case à cocher : `mat-checkbox`.
 *
 * ```vue
 * <UiCaseACocher v-model="parApi">Charger les contenus par l’API</UiCaseACocher>
 * ```
 *
 * Une vraie case `<input type="checkbox">`, rendue invisible sous le dessin de Material 3 : le clavier, le libellé cliquable et les lecteurs d'écran restent ceux du navigateur.
 */
const checked = defineModel<boolean>({ default: false });

defineProps<{ disabled?: boolean }>();
</script>

<template>
  <label class="ui-case" :class="{ 'ui-case--desactive': disabled }">
    <span class="ui-case__zone">
      <input
        v-model="checked"
        class="ui-case__natif"
        type="checkbox"
        :disabled="disabled"
      />
      <span class="ui-case__boite" aria-hidden="true">
        <svg class="ui-case__coche" viewBox="0 0 24 24" focusable="false">
          <path fill="none" d="M1.73,12.91 8.1,19.28 22.79,4.59" />
        </svg>
      </span>
    </span>
    <span class="ui-case__libelle"><slot /></span>
  </label>
</template>

<style>
.ui-case {
  display: inline-flex;
  align-items: center;
  vertical-align: middle;
  color: var(--mat-sys-on-surface);
  font-family: Roboto, sans-serif;
  font-size: 0.875rem;
  line-height: 1.25rem;
  letter-spacing: 0.016rem;
  cursor: pointer;
}
.ui-case__zone {
  position: relative;
  flex: none;
  box-sizing: content-box;
  width: 18px;
  height: 18px;
  padding: 11px;
  margin: 4px;
  border-radius: 50%;
}
.ui-case__zone::before {
  content: "";
  position: absolute;
  inset: 0;
  border-radius: 50%;
  background: var(--mat-sys-on-surface);
  opacity: 0;
  pointer-events: none;
}
.ui-case:hover .ui-case__zone::before {
  opacity: 0.08;
}
.ui-case__natif:focus-visible ~ .ui-case__boite::before {
  content: "";
  position: absolute;
  inset: -12px;
  border-radius: 50%;
  background: var(--mat-sys-on-surface);
  opacity: 0.12;
}
.ui-case__natif {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  margin: 0;
  opacity: 0;
  cursor: inherit;
  z-index: 1;
}
.ui-case__boite {
  position: relative;
  display: block;
  box-sizing: border-box;
  width: 18px;
  height: 18px;
  border: 2px solid var(--mat-sys-on-surface-variant);
  border-radius: 2px;
  transition:
    background-color 90ms cubic-bezier(0.4, 0, 0.6, 1),
    border-color 90ms cubic-bezier(0.4, 0, 0.6, 1);
}
.ui-case__coche {
  position: absolute;
  inset: 0;
  width: 100%;
  opacity: 0;
  stroke: var(--mat-sys-on-primary);
  stroke-width: 3.12px;
}
.ui-case__natif:checked ~ .ui-case__boite {
  background: var(--mat-sys-primary);
  border-color: var(--mat-sys-primary);
}
.ui-case__natif:checked ~ .ui-case__boite .ui-case__coche {
  opacity: 1;
}
.ui-case:hover .ui-case__natif:checked ~ .ui-case__boite {
  border-color: var(--mat-sys-primary);
}
.ui-case:hover .ui-case__natif:not(:checked) ~ .ui-case__boite {
  border-color: var(--mat-sys-on-surface);
}
.ui-case__libelle {
  padding-left: 4px;
}
.ui-case--desactive {
  cursor: default;
  color: color-mix(in srgb, var(--mat-sys-on-surface) 38%, transparent);
}
.ui-case--desactive .ui-case__zone::before {
  display: none;
}
.ui-case--desactive .ui-case__boite,
.ui-case--desactive:hover .ui-case__natif:not(:checked) ~ .ui-case__boite {
  border-color: color-mix(in srgb, var(--mat-sys-on-surface) 38%, transparent);
}
.ui-case--desactive .ui-case__natif:checked ~ .ui-case__boite {
  background: color-mix(in srgb, var(--mat-sys-on-surface) 38%, transparent);
  border-color: transparent;
}
.ui-case--desactive .ui-case__coche {
  stroke: var(--mat-sys-surface);
}
</style>
