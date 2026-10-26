# Documentation de Skanon

## Ordre de lecture

1. [developpement.md](developpement.md) — l'arborescence, les commandes, les pièges d'outillage. À garder ouvert.
2. [invariants.md](invariants.md) — `INV-1`…`INV-10`, les contraintes non négociables. À relire.
3. [pratiques.md](pratiques.md) — la frontière avec le système, les niveaux de test, les erreurs, la mise en page, le cycle de livraison.
4. [clean-code.md](clean-code.md) — comment s'écrit l'intérieur d'une unité, et ce que l'outillage fait respecter.
5. [conventions.md](conventions.md) — nommage, langue, commentaires, commits.

## Par tâche

| Pour…                                     | Ouvrir                                                                |
| ----------------------------------------- | --------------------------------------------------------------------- |
| Ajouter une vue ou une route              | [developpement.md](developpement.md#ajouter-une-vue)                  |
| Parler au système (secret, lien, fichier) | [pratiques.md](pratiques.md#la-frontière-avec-le-système)             |
| Écrire un test                            | [pratiques.md](pratiques.md#les-tests)                                |
| Lancer un test seul, ou en veille         | [developpement.md](developpement.md#les-gestes-courants)              |
| Consommer ce dépôt comme un paquet        | [developpement.md](developpement.md#le-paquet)                        |
| Ajouter un point d'extension              | [pratiques.md](pratiques.md#ce-qui-tient-au-livrable--les-extensions) |

## Ce qui n'est pas ici

- **Les décisions produit** : le référentiel de SSK Canon, [ssk-it/ssk-canon](https://github.com/ssk-it/ssk-canon), décrit dans son propre format. Le consulter par le skill `consulter-referentiel` avant toute évolution fonctionnelle. Skanon y est le produit : le cadrage livré [ssk-canon#2026-051](https://ssk-canon.s3-website.fr-par.scw.cloud/ssk-it/ssk-canon/cadrages/2026-051) en fait l'application qui remplace ssk-canon-pwa, sous le seul nom de Skanon (`ADR-application-de-bureau`).
- **L'application de bureau** : son cœur natif, son adaptateur, ses extensions, sa publication et son déploiement vivent dans un dépôt privé, qui consomme ce dépôt comme un paquet épinglé (ADR-extensions-commerciales). Le déploiement de la version web s'y fait aussi, pour l'instant.
- **La lecture du format** : la bibliothèque [`@ssk-it/canon-check`](https://github.com/ssk-it/ssk-canon-action), commune à l'application et à l'automatisation (`INV-7`).
