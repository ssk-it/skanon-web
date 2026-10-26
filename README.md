# Skanon

Outil de cadrage et de support durable de la spécification, partagé entre le client et l'équipe de développement. Il comble le vide entre Trello, où le besoin s'exprime succinctement, et GitHub, où le développement se réalise — en gardant sur la durée la trace de ce que chaque fonctionnalité fait, et de pourquoi elle le fait ainsi.

Skanon est le produit SSK Canon : une application de bureau et, depuis le même code d'interface, une application web installable. Ce dépôt porte l'interface commune, en Vue 3, et la version web ; l'application de bureau vit dans un dépôt privé, qui consomme celui-ci comme un paquet. Elle remplace [ssk-canon-pwa](https://github.com/ssk-it/ssk-canon-pwa), la première application web, écrite en Angular, dont elle a repris le comportement et prend la place à la même adresse ([ssk-canon#2026-051](https://ssk-canon.s3-website.fr-par.scw.cloud/ssk-it/ssk-canon/cadrages/2026-051), `ADR-application-de-bureau`).

**Développer** : commencer par [docs/README.md](docs/README.md).

## Le principe

Le **référentiel** — domaines, fonctionnalités, règles de gestion — décrit l'état courant du produit. Les **cadrages** sont les unités de changement, datées, qui le transforment. Le référentiel est la projection des cadrages livrés.

Tout vit dans Git : un dépôt par projet, des fichiers Markdown à frontmatter YAML. L'application lit et écrit par l'API GitHub ; l'historique, l'attribution et la relecture sont fournis par la plateforme — le support survit à l'outil.

## Démarrer

```bash
pnpm install
pnpm dev:web
```

La version web, servie sur `http://localhost:1430`. `pnpm build:web` la construit dans `dist-web/`, que sert n'importe quel hébergement de fichiers.

## Accès aux dépôts

Un dépôt public se lit sans connexion. Un jeton GitHub personnel — en lecture seule tant que l'écriture n'est pas nécessaire — relève les limites d'appels et ouvre les dépôts privés. L'application de bureau le range dans le coffre du système ; la version web, dans le stockage local du navigateur, en clair ou scellé par une passkey — qu'un projet peut exiger.

## Licence

L'interface et la version web sont publiées en source disponible, sous la [Functional Source License 1.1, ALv2 Future License](LICENSE.md) (FSL-1.1-ALv2) : chacun peut les lire, les modifier et les employer, sauf pour en faire un produit ou un service concurrent. Chaque version passe sous Apache-2.0 deux ans après sa publication. L'application de bureau est propriétaire.
