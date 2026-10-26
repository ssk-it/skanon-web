import { demarrer } from "./demarrage";
import { createPlateformeWeb } from "./plateforme/web";
import { extensionWeb } from "./web/extension";

/**
 * La racine de composition de la version web : les adaptateurs du navigateur, et ce que ce livrable apporte (ADR-extensions-commerciales).
 */
void demarrer({
  plateforme: createPlateformeWeb(),
  extensions: [extensionWeb()],
});
