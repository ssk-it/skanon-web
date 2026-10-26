import {
  computed as vueComputed,
  effect as vueEffect,
  effectScope,
  pauseTracking,
  resetTracking,
  shallowRef,
  // `pauseTracking` and `resetTracking`, which `untracked` needs, are not re-exported by `vue`.
  // eslint-disable-next-line vue/prefer-import-from-vue
} from "@vue/reactivity";

/**
 * Signals readable by call — `state()`, `state.set(…)` — on Vue's reactivity.
 *
 * The core inherited from SSK Canon is written in this form, and keeping it makes its port mechanical: a line that read a signal still reads it, and a Vue template that calls `store.state()` subscribes as it would to a `ref`. The mechanics are Vue's — same dependencies, same scheduling —, only the way of reading changes.
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

/** Read without subscribing: in an effect, what is read here does not rerun it. */
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
 * An effect rerun on each change of what it reads. Synchronous, unlike Angular's which waits for change detection: the core's effects only write a signal or a storage, and the order of their writes has never depended on that delay.
 *
 * Created in a component's `setup`, the effect stops with it; elsewhere, it lives until `destroy`.
 */
export function effect(fn: () => void): EffectRef {
  const scope = effectScope();
  scope.run(() => vueEffect(fn));
  return { destroy: () => scope.stop() };
}

/**
 * A writable signal that realigns with its source when it changes — a draft initialised from what the repo says, which the user then modifies.
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
  // Each recomputation returns a fresh object: a hand-set value only holds for the object it saw, and falls away by itself when the source changes.
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
