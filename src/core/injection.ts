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
type Classe<T> = new (...args: any[]) => T;
export type Jeton<T> = Classe<T> | InjectionToken<T>;

const instances = new Map<Jeton<unknown>, unknown>();
const enCreation = new Set<Jeton<unknown>>();

export function inject<T>(jeton: Jeton<T>): T;
export function inject<T>(
  jeton: Jeton<T>,
  options: { optional: true },
): T | null;
export function inject<T>(
  jeton: Jeton<T>,
  options?: { optional: true },
): T | null {
  if (instances.has(jeton)) return instances.get(jeton) as T;
  if (jeton instanceof InjectionToken) {
    if (!jeton.options) {
      if (options?.optional) return null;
      throw new Error(`Aucune valeur fournie pour ${jeton}`);
    }
    return creer(jeton, jeton.options.factory);
  }
  return creer(jeton, () => new jeton());
}

function creer<T>(jeton: Jeton<T>, fabrique: () => T): T {
  if (enCreation.has(jeton)) {
    throw new Error(
      `Dépendance circulaire sur ${String(jeton instanceof InjectionToken ? jeton : jeton.name)}`,
    );
  }
  enCreation.add(jeton);
  try {
    const instance = fabrique();
    instances.set(jeton, instance);
    return instance;
  } finally {
    enCreation.delete(jeton);
  }
}

/**
 * Fournit la valeur d'un jeton : un adaptateur dans la racine de composition, une doublure dans un test. Comme le `useValue` d'Angular, la doublure n'est pas vérifiée contre le type : un test n'en écrit que ce que le service éprouvé appelle.
 */
export function provide<T>(jeton: Jeton<T>, valeur: T | object): void {
  instances.set(jeton, valeur);
}

const finsDeVie: Array<() => void> = [];

/**
 * Ce qu'un service doit défaire quand le conteneur l'oublie — écouteurs, minuteries —, comme `DestroyRef.onDestroy` : sans cela, le service d'un test continuerait d'écouter dans le suivant.
 */
export function onDestroy(fin: () => void): void {
  finsDeVie.push(fin);
}

/** Oublie toutes les instances : chaque test repart d'un conteneur vide. */
export function resetInjection(): void {
  for (const fin of finsDeVie.splice(0)) fin();
  instances.clear();
  enCreation.clear();
}
