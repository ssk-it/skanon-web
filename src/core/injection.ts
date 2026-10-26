/**
 * L'injection du cœur : une instance par service, créée à la première demande.
 *
 * Les services hérités de SSK Canon se demandent leurs dépendances par `inject(Service)` dans leurs champs. Les garder ainsi rend le portage mécanique, et ce conteneur d'une soixantaine de lignes suffit à ce qu'ils en attendent : des singletons, une substitution pour les tests, et des jetons pour ce qui n'est pas une classe.
 *
 * Les composants Vue demandent un service par la même fonction : le conteneur est global à l'application, comme l'était l'injecteur racine.
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
 * Fournit la valeur d'un jeton : un adaptateur dans la racine de composition, une doublure dans un test. Comme le `useValue` d'Angular, la doublure n'est pas vérifiée contre le type : un test n'en écrit que ce que le service éprouvé appelle.
 */
export function provide<T>(token: ProviderToken<T>, value: T | object): void {
  instances.set(token, value);
}

const teardowns: Array<() => void> = [];

/**
 * Ce qu'un service doit défaire quand le conteneur l'oublie — écouteurs, minuteries —, comme `DestroyRef.onDestroy` : sans cela, le service d'un test continuerait d'écouter dans le suivant.
 */
export function onDestroy(end: () => void): void {
  teardowns.push(end);
}

/** Oublie toutes les instances : chaque test repart d'un conteneur vide. */
export function resetInjection(): void {
  for (const end of teardowns.splice(0)) end();
  instances.clear();
  underConstruction.clear();
}
