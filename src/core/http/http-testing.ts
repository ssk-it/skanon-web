import { provide } from "../injection";
import {
  HTTP_BACKEND,
  HttpErrorResponse,
  HttpHeaders,
  HttpResponse,
  type HttpBackend,
  type HttpRequest,
} from "./http";

/**
 * La doublure du transport HTTP, dans la forme du `HttpTestingController` d'Angular : un test lance l'appel, trouve la requête par `expectOne`, puis y répond par `flush` ou `error`.
 *
 * La requête est enregistrée au moment même où le client l'émet. Un appelant qui attend une promesse avant d'émettre — une file d'attente, un cache consulté d'abord — n'a pas encore émis quand le test reprend la main : `await settle()` laisse passer les microtâches en attente.
 */
export class TestRequest {
  private repondu = false;

  constructor(
    readonly request: HttpRequest,
    private readonly resoudre: (reponse: HttpResponse<unknown>) => void,
    private readonly rejeter: (erreur: unknown) => void,
  ) {}

  get cancelled(): boolean {
    return false;
  }

  flush(
    body: unknown,
    options: {
      status?: number;
      statusText?: string;
      headers?: Record<string, string> | HttpHeaders;
    } = {},
  ): void {
    this.assertOuverte();
    const status = options.status ?? 200;
    const headers =
      options.headers instanceof HttpHeaders
        ? options.headers
        : new HttpHeaders(options.headers);
    this.resoudre(
      new HttpResponse(
        status,
        options.statusText ?? (status === 200 ? "OK" : ""),
        headers,
        toBody(body, this.request),
        this.request.url,
      ),
    );
  }

  /** L'absence de réponse — réseau coupé, requête refusée par le navigateur — ou, avec un statut, une erreur sans corps. */
  error(
    cause: unknown,
    options: {
      status?: number;
      statusText?: string;
      headers?: Record<string, string>;
    } = {},
  ): void {
    this.assertOuverte();
    const status = options.status ?? 0;
    if (status === 0) {
      // Comme `fetch` : aucune réponse, une erreur de statut 0 qui porte la cause.
      this.rejeter(
        new HttpErrorResponse(
          0,
          options.statusText ?? "Unknown Error",
          new HttpHeaders(),
          cause,
          this.request.url,
        ),
      );
      return;
    }
    this.resoudre(
      new HttpResponse(
        status,
        options.statusText ?? "",
        new HttpHeaders(options.headers),
        cause,
        this.request.url,
      ),
    );
  }

  private assertOuverte(): void {
    if (this.repondu)
      throw new Error(
        `Requête déjà répondue : ${this.request.method} ${this.request.url}`,
      );
    this.repondu = true;
  }
}

function toBody(body: unknown, requete: HttpRequest): unknown {
  if (
    requete.responseType === "text" &&
    typeof body !== "string" &&
    body !== null
  )
    return JSON.stringify(body);
  if (requete.responseType === "arraybuffer" && typeof body === "string")
    return new TextEncoder().encode(body).buffer;
  return body;
}

type Critere =
  | string
  | ((requete: HttpRequest) => boolean)
  | { method?: string; url?: string };

export class HttpTestingController implements HttpBackend {
  private readonly ouvertes: TestRequest[] = [];

  handle(requete: HttpRequest): Promise<HttpResponse<unknown>> {
    return new Promise((resoudre, rejeter) => {
      const enregistree: TestRequest = new TestRequest(
        requete,
        (r) => {
          this.retirer(enregistree);
          resoudre(r);
        },
        (e) => {
          this.retirer(enregistree);
          rejeter(e);
        },
      );
      this.ouvertes.push(enregistree);
    });
  }

  match(critere: Critere): TestRequest[] {
    const predicat = toPredicat(critere);
    return this.ouvertes.filter((r) => predicat(r.request));
  }

  expectOne(critere: Critere, description?: string): TestRequest {
    const trouvees = this.match(critere);
    if (trouvees.length !== 1) {
      const ouvertes = this.ouvertes
        .map((r) => `${r.request.method} ${r.request.url}`)
        .join("\n  ");
      throw new Error(
        `Une requête attendue pour ${description ?? describe(critere)}, ${trouvees.length} trouvée(s). Requêtes ouvertes :\n  ${ouvertes || "(aucune)"}`,
      );
    }
    return trouvees[0];
  }

  expectNone(critere: Critere, description?: string): void {
    const trouvees = this.match(critere);
    if (trouvees.length)
      throw new Error(
        `Aucune requête attendue pour ${description ?? describe(critere)}, ${trouvees.length} trouvée(s).`,
      );
  }

  verify(): void {
    if (this.ouvertes.length) {
      throw new Error(
        `Requêtes restées sans réponse :\n  ${this.ouvertes.map((r) => `${r.request.method} ${r.request.url}`).join("\n  ")}`,
      );
    }
  }

  private retirer(requete: TestRequest): void {
    const i = this.ouvertes.indexOf(requete);
    if (i >= 0) this.ouvertes.splice(i, 1);
  }
}

function toPredicat(critere: Critere): (r: HttpRequest) => boolean {
  if (typeof critere === "string") return (r) => r.url === critere;
  if (typeof critere === "function") return critere;
  return (r) =>
    (!critere.method || r.method === critere.method.toUpperCase()) &&
    (!critere.url || r.url === critere.url);
}

function describe(critere: Critere): string {
  if (typeof critere === "string") return critere;
  if (typeof critere === "function") return "le prédicat";
  return `${critere.method ?? "*"} ${critere.url ?? "*"}`;
}

/** Installe la doublure dans le conteneur, et la rend. */
export function provideHttpTesting(): HttpTestingController {
  const controleur = new HttpTestingController();
  provide(HTTP_BACKEND, controleur);
  return controleur;
}

/** Laisse passer les microtâches en attente : ce qu'un appelant fait avant d'émettre sa requête. */
export async function settle(tours = 10): Promise<void> {
  for (let i = 0; i < tours; i++) await Promise.resolve();
}
