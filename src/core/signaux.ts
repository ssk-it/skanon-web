import {
  computed as vueComputed,
  effect as vueEffect,
  effectScope,
  pauseTracking,
  resetTracking,
  shallowRef,
  // `pauseTracking` et `resetTracking`, dont `untracked` a besoin, ne sont pas réexportés par `vue`.
  // eslint-disable-next-line vue/prefer-import-from-vue
} from "@vue/reactivity";

/**
 * Des signaux lisibles par appel — `etat()`, `etat.set(…)` — sur la réactivité de Vue.
 *
 * Le cœur hérité de SSK Canon est écrit dans cette forme, et la garder rend son portage mécanique : une ligne qui lisait un signal le lit toujours, et un gabarit Vue qui appelle `store.etat()` s'abonne comme il le ferait à une `ref`. La mécanique est celle de Vue — mêmes dépendances, même ordonnancement —, seule la façon de lire change.
 */
export interface Signal<T> {
  (): T;
}

export interface WritableSignal<T> extends Signal<T> {
  set(value: T): void;
  update(fn: (value: T) => T): void;
  asReadonly(): Signal<T>;
}

export function signal<T>(initialValue: T): WritableSignal<T> {
  const ref = shallowRef(initialValue);
  const read = (() => ref.value) as WritableSignal<T>;
  read.set = (value) => {
    ref.value = value;
  };
  read.update = (fn) => {
    ref.value = fn(ref.value);
  };
  read.asReadonly = () => () => ref.value;
  return read;
}

export function computed<T>(fn: () => T): Signal<T> {
  const ref = vueComputed(fn);
  return () => ref.value;
}

/** Lire sans s'abonner : dans un effet, ce qui est lu ici ne le relance pas. */
export function untracked<T>(fn: () => T): T {
  pauseTracking();
  try {
    return fn();
  } finally {
    resetTracking();
  }
}

export interface EffectRef {
  destroy(): void;
}

/**
 * Un effet relancé à chaque changement de ce qu'il lit. Synchrone, contrairement à celui d'Angular qui attend la détection de changements : les effets du cœur ne font qu'écrire un signal ou un stockage, et l'ordre de leurs écritures n'a jamais dépendu de ce délai.
 *
 * Créé dans le `setup` d'un composant, l'effet s'arrête avec lui ; ailleurs, il vit jusqu'à `destroy`.
 */
export function effect(fn: () => void): EffectRef {
  const scope = effectScope();
  scope.run(() => vueEffect(fn));
  return { destroy: () => scope.stop() };
}

/**
 * Un signal modifiable qui se réaligne sur sa source quand elle change — un brouillon initialisé depuis ce que le dépôt dit, que l'utilisateur modifie ensuite.
 */
export function linkedSignal<S, T = S>(
  options:
    | (() => T)
    | {
        source: () => S;
        computation: (source: S, previous?: { source: S; value: T }) => T;
      },
): WritableSignal<T> {
  const { source, computation } =
    typeof options === "function"
      ? {
          source: options as unknown as () => S,
          computation: (s: S) => s as unknown as T,
        }
      : options;
  let previous: { source: S; value: T } | undefined;
  // Chaque recalcul rend un objet neuf : une valeur posée à la main ne vaut que pour l'objet qu'elle a vu, et tombe d'elle-même quand la source change.
  const derived = vueComputed(() => {
    const s = source();
    const value = untracked(() => computation(s, previous));
    previous = { source: s, value };
    return { source: s, value };
  });
  const local = shallowRef<{ basis: object; value: T } | null>(null);
  const read = (() => {
    const d = derived.value;
    const l = local.value;
    return l && l.basis === d ? l.value : d.value;
  }) as WritableSignal<T>;
  read.set = (value) => {
    const d = derived.value;
    local.value = { basis: d, value };
    previous = { source: d.source, value: value };
  };
  read.update = (fn) => read.set(fn(read()));
  read.asReadonly = () => () => read();
  return read;
}
