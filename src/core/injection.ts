/**
 * The core's injection: one instance per service, created on first request.
 *
 * The services inherited from SSK Canon request their dependencies through `inject(Service)` in their fields. Keeping them so makes the port mechanical, and this container of some sixty lines is enough for what they expect of it: singletons, a substitution for tests, and tokens for what is not a class.
 *
 * Vue components request a service through the same function: the container is global to the application, as the root injector was.
 */

export class InjectionToken<T> {
  constructor(
    readonly description: string,
    readonly options?: { readonly factory: () => T },
  ) {}

  toString(): string {
    return `InjectionToken(${this.description})`;
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ClassType<T> = new (...args: any[]) => T;
export type ProviderToken<T> = ClassType<T> | InjectionToken<T>;

const instances = new Map<ProviderToken<unknown>, unknown>();
const underConstruction = new Set<ProviderToken<unknown>>();

export function inject<T>(token: ProviderToken<T>): T;
export function inject<T>(
  token: ProviderToken<T>,
  options: { optional: true },
): T | null;
export function inject<T>(
  token: ProviderToken<T>,
  options?: { optional: true },
): T | null {
  if (instances.has(token)) return instances.get(token) as T;
  if (token instanceof InjectionToken) {
    if (!token.options) {
      if (options?.optional) return null;
      throw new Error(`Aucune valeur fournie pour ${token}`);
    }
    return create(token, token.options.factory);
  }
  return create(token, () => new token());
}

function create<T>(token: ProviderToken<T>, factory: () => T): T {
  if (underConstruction.has(token)) {
    throw new Error(
      `Dépendance circulaire sur ${String(token instanceof InjectionToken ? token : token.name)}`,
    );
  }
  underConstruction.add(token);
  try {
    const instance = factory();
    instances.set(token, instance);
    return instance;
  } finally {
    underConstruction.delete(token);
  }
}

/**
 * Provides a token's value: an adapter in the composition root, a fake in a test. Like Angular's `useValue`, the fake is not checked against the type: a test only writes what the service under test calls.
 */
export function provide<T>(token: ProviderToken<T>, value: T | object): void {
  instances.set(token, value);
}

const teardowns: Array<() => void> = [];

/**
 * What a service must undo when the container forgets it — listeners, timers —, like `DestroyRef.onDestroy`: without it, a test's service would keep listening in the next one.
 */
export function onDestroy(end: () => void): void {
  teardowns.push(end);
}

/** Forgets all instances: each test starts again from an empty container. */
export function resetInjection(): void {
  for (const end of teardowns.splice(0)) end();
  instances.clear();
  underConstruction.clear();
}
