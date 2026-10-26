# Conventions

## La règle en une phrase

**Le vocabulaire métier reste en français, partout ; la mécanique reste en anglais.** Un terme du domaine — cadrage, référentiel, règle, fonctionnalité, domaine, impact, décision, statut, jeton, coffre — ne se traduit jamais, pas même dans un nom de variable : le client parle de « cadrages », et le code aussi. Tout ce qui n'appartient pas au domaine — verbes, structures, types techniques, plateforme — s'écrit en anglais, comme le reste de l'écosystème.

C'est la convention de SSK Canon, reprise telle quelle : le cœur porté garde ses noms, et une recherche dans l'un retrouve l'autre.

## Méthodes et fonctions

`verbeAnglais` + `TermeMétierFrançais`, en camelCase : `loadReferentiel()`, `findRegleById(id)`, `saveJetons(jetons)`. Un verbe sans complément métier reste anglais : `retry()`, `open(url)`.

Verbes retenus : `load` (lire depuis GitHub, le stockage ou le coffre), `parse` / `serialize`, `build` (assembler en mémoire), `find` (rend `null` si absent), `get` (lève si absent), `list` (rend un tableau), `save` / `commit` (écrire), `delete`, `upload`, `apply`, `validate` (rend des erreurs), `assert` (lève), `format`, `is` / `has`, `to` (conversion), `create` (fabriquer un objet neuf), `listen`.

## Types et champs

- Types métier : le terme français en PascalCase, sans accent — `Cadrage`, `Regle`, `CoffreDeJetons`. Types techniques : anglais — `HttpClient`, `HttpErrorResponse`.
- Champs : ceux du frontmatter qu'ils décrivent, en camelCase là où le YAML est en snake_case (`cree_par` → `creePar`).
- **Pas d'accents ni de cédilles dans les identifiants**. Les accents sont pour le contenu, les libellés et les commentaires.

## Fichiers

- Composants Vue : PascalCase, suffixe du rôle — `CadragePage.vue`, `StatutChip.vue`.
- Le reste : kebab-case — `github-client.ts`, `referentiel.store.ts`. Un test à côté de ce qu'il éprouve : `referentiel.store.test.ts`.

## Interface

Tout ce que l'utilisateur lit est en français, accents compris, dans les gabarits — jamais en dur dans la logique d'un service.

## Commentaires

En français. Ils disent le **pourquoi** — la contrainte, l'invariant, l'option écartée —, jamais le quoi. Un commentaire qui paraphrase la ligne suivante se supprime. Ils citent l'invariant (`INV-7`) ou la règle de gestion (`RG-dernier-etat-connu`) plutôt que de la reformuler.

## Commits

Impératif présent, en anglais, préfixe de portée quand il aide : `core:`, `ui:`, `web:`, `ci:`, `docs:`. Le corps dit pourquoi, à 72 colonnes.

## Documentation

Les fichiers Markdown ne coupent pas leurs lignes : un paragraphe tient sur une ligne. `proseWrap: "preserve"` dans `.prettierrc.json`.
