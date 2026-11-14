import { inject } from "../injection";
import {
  checkRepo,
  enTexte,
  formaterAnomalie,
  verifierDiagrammes,
  type Anomalie,
} from "@ssk-it/canon-check";
import { LocaleService } from "../i18n/locale.service";
import { SpecificationStore } from "./specification.store";
import {
  Scoping,
  TargetKind,
  ImpactOperation,
  Specification,
} from "../model/model";

/** What the verifier reads of a scoping: the scoping being entered, or a scoping from the specification. */
type ScopingEntry = Pick<Scoping, "id" | "domains" | "statements"> & {
  readonly impacts: ScopingInput["impacts"];
};

/** What verification reports of a scoping being authored. */
export interface Verdict {
  /** What would prevent delivery. */
  readonly errors: readonly string[];
  /** What deserves attention without blocking. */
  readonly warnings: readonly string[];
  /** The same, coded: what is said again when the language changes (RG-anomalies-codees). */
  readonly anomalies: readonly Anomalie[];
}

/** Reads a diagram: resolves if the engine that draws can, rejects with its message otherwise. */
export type DiagramParser = (text: string) => Promise<unknown>;

/** A scoping as entered, not written yet. */
export interface ScopingInput {
  readonly id: string;
  readonly title: string;
  readonly domains: readonly string[];
  readonly impacts: ReadonlyArray<{
    readonly target: string;
    readonly kind?: TargetKind;
    readonly operation: ImpactOperation;
  }>;
  readonly statements: ReadonlyMap<string, string>;
}

/**
 * Integrity verification during authoring.
 *
 * The rules are those of `@ssk-it/canon-check`, the same module the Action
 * runs before each delivery. It depends on no file system: the Action gives
 * it a specification read from disk, the application gives it the one it has
 * loaded. A single implementation, two moments.
 *
 * **What remains less reliable here than in continuous integration.** The
 * application knows the main branch's specification, augmented with only the
 * scoping in progress. A neighbouring scoping, open on another branch,
 * escapes it — checks on derived indexes or repealed rules may therefore
 * conclude less than the final verification.
 *
 * The disagreement always goes the same way: the application reports less,
 * never more. What it asserts is true; what it leaves unsaid may still
 * appear at delivery, where verification remains the authority.
 */
export class VerificationService {
  private readonly store = inject(SpecificationStore);
  private readonly locale = inject(LocaleService);

  /**
   * Verifies the specification as it would be with this scoping.
   */
  checkScoping(input: ScopingInput, context?: Specification): Verdict {
    const { repo, livres } = this.verifiable(input, context);
    // `ignorerIndexDerives`: `cree_par` and `modifie_par` are written by
    // propagation, after delivery. Requiring them correct during authoring
    // would report as a fault what the scoping has not produced yet.
    const { anomalies } = checkRepo(repo, {
      ignorerIndexDerives: true,
      livres,
    });
    return this.concerning(input, anomalies);
  }

  /**
   * The diagrams of the scoping that the given parser cannot read — scoping 2026-074 of ssk-it/ssk-canon.
   *
   * Apart from `checkScoping` because the syntax needs the engine that draws, which loads asynchronously; the library extracts the blocks and owns the anomaly, the view gives the parser — the core imports no renderer (docs/practices.md, « Layers »). A scoping without a diagram does not call it: the engine is then never loaded, as for display (RG-diagrammes-rendus).
   */
  async checkDiagrams(
    input: ScopingInput,
    parse: DiagramParser,
    context?: Specification,
  ): Promise<Verdict> {
    const hasDiagram = [...input.statements.values()].some((s) =>
      s.includes("```mermaid"),
    );
    if (!hasDiagram) return { errors: [], warnings: [], anomalies: [] };
    const { repo, livres } = this.verifiable(input, context);
    const anomalies = await verifierDiagrammes(repo, {
      analyser: parse,
      livres,
    });
    return this.concerning(input, anomalies);
  }

  /**
   * The specification as it would be with this scoping, under the format's names.
   *
   * The scoping being entered replaces its saved version: it is indeed the
   * effect of what is being written that we want to measure, not that of what
   * is already in the repo.
   */
  private verifiable(input: ScopingInput, context?: Specification) {
    // The context of the edited branch, when it is known: a scoping often
    // creates the domain or the rules it declares, and these do not exist yet
    // on the main branch. Ignoring them would report as unknown what the
    // scoping itself brings — a defect that is not one, and that verification
    // at delivery does not raise.
    const ref = context ?? this.store.specification();

    const scopings = new Map<string, ScopingEntry>(ref.scopings);
    scopings.set(input.id, {
      id: input.id,
      domains: input.domains,
      impacts: input.impacts,
      statements: input.statements,
    });

    return {
      repo: {
        domains: ref.domains,
        features: mapValues(ref.features, (f) => ({
          id: f.id,
          domaines: f.domains,
        })),
        rules: mapValues(ref.rules, (r) => ({
          ...derivedIndexes(r),
          fonctionnalites: r.features,
        })),
        // Without them, the verifier would hold every architecture target as
        // unknown: it looks for each impact in the collection its kind designates,
        // and an absent collection reads as empty.
        decisions: mapValues(ref.decisions, derivedIndexes),
        architecture: mapValues(ref.architecture, derivedIndexes),
        cadrages: mapValues(scopings, toCheckedScoping),
        errors: [],
      },
      livres: new Set(
        [...ref.scopings.values()]
          .filter((c) => !c.provenance)
          .map((c) => c.id),
      ),
    };
  }

  /** What concerns this scoping, said in the interface's language. */
  private concerning(
    input: ScopingInput,
    anomalies: readonly Anomalie[],
  ): Verdict {
    // What concerns this scoping is read in the library's French form, the one that names it the same way whatever the displayed language.
    const concerned = anomalies.filter((a) =>
      formaterAnomalie(a, "fr").includes(input.id),
    );
    // RG-verification-a-la-saisie: the message is the library's, for the code it returned, in the interface's language — never a rewording of ours. Read here, the language makes a caller's computed say them again when it changes.
    return {
      ...enTexte(concerned, this.locale.language()),
      anomalies: concerned,
    };
  }
}

/*
 * The verifier reads entities under the SSK Canon format's names — `domaines`, `statut`, `enonces`, and each impact's key that states its kind (`regle`, `adr`, `architecture`) —, the model names them in English. The mapping is done here, in a single place: a missing property would be reported by no compilation, only by a check that no longer checks anything.
 */

function mapValues<T, U>(
  map: ReadonlyMap<string, T>,
  convert: (value: T) => U,
): ReadonlyMap<string, U> {
  return new Map([...map].map(([id, value]) => [id, convert(value)]));
}

function derivedIndexes(entry: {
  readonly id: string;
  readonly status: string;
  readonly createdBy: string | null;
  readonly modifiedBy: readonly string[];
}) {
  return {
    id: entry.id,
    statut: entry.status,
    cree_par: entry.createdBy,
    modifie_par: entry.modifiedBy,
  };
}

/** A scoping does not declare its status: the verifier would refuse to read one. */
function toCheckedScoping(scoping: ScopingEntry) {
  return {
    id: scoping.id,
    domaines: scoping.domains,
    enonces: scoping.statements,
    impacts: scoping.impacts.map((i) => ({
      [i.kind ?? "regle"]: i.target,
      operation: i.operation,
    })),
  };
}
