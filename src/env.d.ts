/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** La cible du build : la version web statique (`vite.config.ts`), ou l'application de bureau, que son dépôt construit depuis ce même code. */
  readonly VITE_CIBLE: "bureau" | "web";
  /** Le commit construit, en sept caractères, ou `développement` hors d'un dépôt (`vite.config.ts`). Seule la version web l'affiche. */
  readonly VITE_VERSION: string;
}
