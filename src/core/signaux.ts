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
  set(valeur: T): void;
  update(fn: (valeur: T) => T): void;
  asReadonly(): Signal<T>;
}

export function signal<T>(initiale: T): WritableSignal<T> {
  const ref = shallowRef(initiale);
  const lire = (() => ref.value) as WritableSignal<T>;
  lire.set = (valeur) => {
    ref.value = valeur;
  };
  lire.update = (fn) => {
    ref.value = fn(ref.value);
  };
  lire.asReadonly = () => () => ref.value;
  return lire;
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
  const portee = effectScope();
  portee.run(() => vueEffect(fn));
  return { destroy: () => portee.stop() };
}

/**
 * Un signal modifiable qui se réaligne sur sa source quand elle change — un brouillon initialisé depuis ce que le dépôt dit, que l'utilisateur modifie ensuite.
 */
export function linkedSignal<S, T = S>(
  options:
    | (() => T)
    | {
        source: () => S;
        computation: (source: S, precedent?: { source: S; value: T }) => T;
      },
): WritableSignal<T> {
  const { source, computation } =
    typeof options === "function"
      ? {
          source: options as unknown as () => S,
          computation: (s: S) => s as unknown as T,
        }
      : options;
  let precedent: { source: S; value: T } | undefined;
  // Chaque recalcul rend un objet neuf : une valeur posée à la main ne vaut que pour l'objet qu'elle a vu, et tombe d'elle-même quand la source change.
  const derive = vueComputed(() => {
    const s = source();
    const value = untracked(() => computation(s, precedent));
    precedent = { source: s, value };
    return { source: s, value };
  });
  const local = shallowRef<{ pour: object; valeur: T } | null>(null);
  const lire = (() => {
    const d = derive.value;
    const l = local.value;
    return l && l.pour === d ? l.valeur : d.value;
  }) as WritableSignal<T>;
  lire.set = (valeur) => {
    const d = derive.value;
    local.value = { pour: d, valeur };
    precedent = { source: d.source, value: valeur };
  };
  lire.update = (fn) => lire.set(fn(lire()));
  lire.asReadonly = () => () => lire();
  return lire;
}
