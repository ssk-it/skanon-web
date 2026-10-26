/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** The build target: the static web version (`vite.config.ts`), or the desktop application, which its repo builds from this same code. */
  readonly VITE_TARGET: "bureau" | "web";
  /** The built commit, in seven characters, or `développement` outside a repo (`vite.config.ts`). Only the web version shows it. */
  readonly VITE_VERSION: string;
}
