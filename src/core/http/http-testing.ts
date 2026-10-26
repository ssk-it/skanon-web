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
 * The HTTP transport's fake, in the shape of Angular's `HttpTestingController`: a test starts the call, finds the request with `expectOne`, then answers it with `flush` or `error`.
 *
 * The request is recorded at the very moment the client emits it. A caller that awaits a promise before emitting — a queue, a cache consulted first — has not emitted yet when the test resumes: `await settle()` lets pending microtasks through.
 */
export class TestRequest {
  private answered = false;

  constructor(
    readonly request: HttpRequest,
    private readonly resolve: (response: HttpResponse<unknown>) => void,
    private readonly reject: (error: unknown) => void,
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
    this.assertOpen();
    const status = options.status ?? 200;
    const headers =
      options.headers instanceof HttpHeaders
        ? options.headers
        : new HttpHeaders(options.headers);
    this.resolve(
      new HttpResponse(
        status,
        options.statusText ?? (status === 200 ? "OK" : ""),
        headers,
        toBody(body, this.request),
        this.request.url,
      ),
    );
  }

  /** The absence of a response — network down, request refused by the browser — or, with a status, an error without a body. */
  error(
    cause: unknown,
    options: {
      status?: number;
      statusText?: string;
      headers?: Record<string, string>;
    } = {},
  ): void {
    this.assertOpen();
    const status = options.status ?? 0;
    if (status === 0) {
      // Like `fetch`: no response, a status 0 error carrying the cause.
      this.reject(
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
    this.resolve(
      new HttpResponse(
        status,
        options.statusText ?? "",
        new HttpHeaders(options.headers),
        cause,
        this.request.url,
      ),
    );
  }

  private assertOpen(): void {
    if (this.answered)
      throw new Error(
        `Requête déjà répondue : ${this.request.method} ${this.request.url}`,
      );
    this.answered = true;
  }
}

function toBody(body: unknown, query: HttpRequest): unknown {
  if (
    query.responseType === "text" &&
    typeof body !== "string" &&
    body !== null
  )
    return JSON.stringify(body);
  if (query.responseType === "arraybuffer" && typeof body === "string")
    return new TextEncoder().encode(body).buffer;
  return body;
}

type Criterion =
  | string
  | ((query: HttpRequest) => boolean)
  | { method?: string; url?: string };

export class HttpTestingController implements HttpBackend {
  private readonly open: TestRequest[] = [];

  handle(query: HttpRequest): Promise<HttpResponse<unknown>> {
    return new Promise((resolve, reject) => {
      const registered: TestRequest = new TestRequest(
        query,
        (r) => {
          this.remove(registered);
          resolve(r);
        },
        (e) => {
          this.remove(registered);
          reject(e);
        },
      );
      this.open.push(registered);
    });
  }

  match(criterion: Criterion): TestRequest[] {
    const predicate = toPredicate(criterion);
    return this.open.filter((r) => predicate(r.request));
  }

  expectOne(criterion: Criterion, description?: string): TestRequest {
    const found = this.match(criterion);
    if (found.length !== 1) {
      const open = this.open
        .map((r) => `${r.request.method} ${r.request.url}`)
        .join("\n  ");
      throw new Error(
        `Une requête attendue pour ${description ?? describe(criterion)}, ${found.length} trouvée(s). Requêtes ouvertes :\n  ${open || "(aucune)"}`,
      );
    }
    return found[0];
  }

  expectNone(criterion: Criterion, description?: string): void {
    const found = this.match(criterion);
    if (found.length)
      throw new Error(
        `Aucune requête attendue pour ${description ?? describe(criterion)}, ${found.length} trouvée(s).`,
      );
  }

  verify(): void {
    if (this.open.length) {
      throw new Error(
        `Requêtes restées sans réponse :\n  ${this.open.map((r) => `${r.request.method} ${r.request.url}`).join("\n  ")}`,
      );
    }
  }

  private remove(query: TestRequest): void {
    const i = this.open.indexOf(query);
    if (i >= 0) this.open.splice(i, 1);
  }
}

function toPredicate(criterion: Criterion): (r: HttpRequest) => boolean {
  if (typeof criterion === "string") return (r) => r.url === criterion;
  if (typeof criterion === "function") return criterion;
  return (r) =>
    (!criterion.method || r.method === criterion.method.toUpperCase()) &&
    (!criterion.url || r.url === criterion.url);
}

function describe(criterion: Criterion): string {
  if (typeof criterion === "string") return criterion;
  if (typeof criterion === "function") return "le prédicat";
  return `${criterion.method ?? "*"} ${criterion.url ?? "*"}`;
}

/** Installs the fake in the container, and returns it. */
export function provideHttpTesting(): HttpTestingController {
  const controller = new HttpTestingController();
  provide(HTTP_BACKEND, controller);
  return controller;
}

/** Lets pending microtasks through: what a caller does before emitting its request. */
export async function settle(rounds = 10): Promise<void> {
  for (let i = 0; i < rounds; i++) await Promise.resolve();
}
