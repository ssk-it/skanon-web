<script setup lang="ts">
/**
 * The frame shared by the kit's fields — `UiTextField`, `UiSelect`, `UiAutocomplete`: the notched outline of `mat-form-field appearance="outline"`, its floating label, and the hint line below. Internal to the kit: a view uses one of the three fields, never the frame alone.
 *
 * The notch is a `<fieldset>` whose `<legend>` carries the label, invisible: its width opens the outline exactly where the label floats, whatever its length.
 *
 * As in Material, the hint line reserves only 16 px, and a long hint overflows onto what follows: hence the 10 px margin under each field, which SSK Canon's `styles.scss` set on `.mat-mdc-form-field`.
 */
defineProps<{
  label?: string;
  /** The control's id, so that the label designates it. */
  controlId: string;
  floating: boolean;
  focus: boolean;
  error?: string | null;
  hint?: string | null;
  disabled?: boolean;
}>();

defineEmits<{ activate: [] }>();
</script>

<template>
  <div
    class="ui-champ"
    :class="{
      'ui-champ--flotte': floating,
      'ui-champ--focus': focus,
      'ui-champ--erreur': !!error,
      'ui-champ--desactive': disabled,
      'ui-champ--sans-libelle': !label,
    }"
  >
    <div class="ui-champ__boite" @click="$emit('activate')">
      <fieldset class="ui-champ__contour" aria-hidden="true">
        <legend v-if="label">
          <span>{{ label }}</span>
        </legend>
      </fieldset>
      <label v-if="label" class="ui-champ__libelle" :for="controlId">{{
        label
      }}</label>
      <div class="ui-champ__controle">
        <slot />
      </div>
    </div>
    <div class="ui-champ__sous">
      <!-- Its id is the control's followed by `-indices`: the control is described by it (`aria-describedby`), and the error or the hint is read with it. -->
      <div :id="`${controlId}-indices`" class="ui-champ__indices">
        <span v-if="error" class="ui-champ__erreur" role="alert">{{
          error
        }}</span>
        <slot v-else name="indice">
          <span v-if="hint" class="ui-champ__indice">{{ hint }}</span>
        </slot>
      </div>
    </div>
  </div>
</template>

<style>
.ui-champ {
  position: relative;
  display: inline-flex;
  flex-direction: column;
  min-width: 0;
  text-align: left;
  margin-bottom: 10px;
  font-family: Roboto, sans-serif;
}

/* A field has no need to push what follows its last line, in a dialog. */
.ui-dialogue__contenu .ui-champ:not(:has(~ .ui-champ)) {
  margin-bottom: 0;
}

.ui-champ__boite {
  position: relative;
  display: flex;
  align-items: stretch;
  cursor: text;
}

.ui-champ__contour {
  position: absolute;
  inset: -5px 0 0;
  margin: 0;
  padding: 0 12px;
  border: 1px solid var(--mat-sys-outline);
  border-radius: 4px;
  pointer-events: none;
  min-width: 0;
  overflow: hidden;
}

.ui-champ__contour legend {
  float: unset;
  width: auto;
  height: 11px;
  max-width: 0.01px;
  padding: 0;
  overflow: hidden;
  display: block;
  visibility: hidden;
  font-size: 0.75rem;
  line-height: 11px;
  white-space: nowrap;
  transition: max-width 50ms cubic-bezier(0, 0, 0.2, 1);
}
.ui-champ__contour legend span {
  display: inline-block;
  padding: 0 4px;
}
.ui-champ--flotte .ui-champ__contour legend {
  max-width: 100%;
  transition-duration: 100ms;
  transition-delay: 50ms;
}

.ui-champ__libelle {
  position: absolute;
  left: 16px;
  top: 28px;
  max-width: calc(100% - 32px);
  transform: translateY(-50%);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  pointer-events: none;
  color: var(--mat-sys-on-surface-variant);
  font-size: 1rem;
  line-height: 1.5rem;
  letter-spacing: 0.031rem;
  transition:
    top 150ms cubic-bezier(0.4, 0, 0.2, 1),
    font-size 150ms cubic-bezier(0.4, 0, 0.2, 1);
}
.ui-champ--flotte .ui-champ__libelle {
  top: 0;
  font-size: 0.75rem;
  line-height: 1rem;
  letter-spacing: 0.025rem;
}

.ui-champ__controle {
  position: relative;
  flex: auto;
  box-sizing: content-box;
  width: 180px;
  min-width: 0;
  min-height: 24px;
  padding: 16px;
}

.ui-champ__sous {
  position: relative;
  box-sizing: border-box;
  width: 100%;
  font-size: 0.75rem;
  line-height: 1rem;
  letter-spacing: 0.025rem;
}
.ui-champ__sous::before {
  content: "";
  display: inline-block;
  height: 16px;
}
.ui-champ__indices {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  display: flex;
  padding: 0 16px;
}
.ui-champ__indice {
  color: var(--mat-sys-on-surface-variant);
}
.ui-champ__erreur {
  display: block;
  color: var(--mat-sys-error);
}

.ui-champ__boite:hover .ui-champ__contour {
  border-color: var(--mat-sys-on-surface);
}
.ui-champ__boite:hover .ui-champ__libelle {
  color: var(--mat-sys-on-surface);
}
.ui-champ--focus .ui-champ__contour,
.ui-champ--focus .ui-champ__boite:hover .ui-champ__contour {
  border-width: 2px;
  border-color: var(--mat-sys-primary);
  padding: 0 11px;
}
.ui-champ--focus .ui-champ__libelle,
.ui-champ--focus .ui-champ__boite:hover .ui-champ__libelle {
  color: var(--mat-sys-primary);
}
.ui-champ--erreur .ui-champ__contour,
.ui-champ--erreur .ui-champ__libelle {
  border-color: var(--mat-sys-error);
  color: var(--mat-sys-error);
}
.ui-champ--erreur .ui-champ__boite:hover .ui-champ__contour,
.ui-champ--erreur .ui-champ__boite:hover .ui-champ__libelle {
  border-color: var(--mat-sys-on-error-container);
  color: var(--mat-sys-on-error-container);
}
.ui-champ--erreur.ui-champ--focus .ui-champ__contour,
.ui-champ--erreur.ui-champ--focus .ui-champ__libelle {
  border-color: var(--mat-sys-error);
  color: var(--mat-sys-error);
}
.ui-champ--desactive .ui-champ__boite {
  cursor: default;
}
.ui-champ--desactive .ui-champ__contour,
.ui-champ--desactive .ui-champ__boite:hover .ui-champ__contour {
  border-color: color-mix(in srgb, var(--mat-sys-on-surface) 12%, transparent);
}
.ui-champ--desactive .ui-champ__libelle,
.ui-champ--desactive .ui-champ__boite:hover .ui-champ__libelle {
  color: color-mix(in srgb, var(--mat-sys-on-surface) 38%, transparent);
}

/* The control itself: an `<input>` or a `<textarea>` of `UiTextField`, the trigger of `UiSelect`. */
.ui-champ__saisie {
  display: block;
  width: 100%;
  min-width: 0;
  margin: 0;
  padding: 0;
  border: none;
  border-radius: 0;
  outline: none;
  background: none;
  color: var(--mat-sys-on-surface);
  caret-color: var(--mat-sys-primary);
  font: inherit;
  font-family: Roboto, sans-serif;
  font-size: 1rem;
  line-height: 1.5rem;
  letter-spacing: 0.031rem;
  -webkit-appearance: none;
  appearance: none;
}
.ui-champ--erreur .ui-champ__saisie {
  caret-color: var(--mat-sys-error);
}
.ui-champ--desactive .ui-champ__saisie {
  color: color-mix(in srgb, var(--mat-sys-on-surface) 38%, transparent);
}
/* The secret of a `UiTextField secret`: discs, as in a password field, without being one. */
.ui-champ__saisie--secret {
  -webkit-text-security: disc;
}
.ui-champ__saisie::placeholder {
  color: var(--mat-sys-on-surface-variant);
  opacity: 0;
}
.ui-champ--focus .ui-champ__saisie::placeholder,
.ui-champ--sans-libelle .ui-champ__saisie::placeholder {
  opacity: 1;
}
textarea.ui-champ__saisie {
  vertical-align: middle;
  resize: vertical;
  height: auto;
  overflow: auto;
  scrollbar-gutter: stable;
}
</style>
