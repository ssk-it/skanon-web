import { InjectionToken, inject } from "../injection";

/**
 * Le client HTTP du cœur, sur `fetch`.
 *
 * Il reprend la forme de celui d'Angular dans ce que SSK Canon en employait — en-têtes immuables, réponse complète, erreur pour tout statut hors de 2xx, 304 compris —, à ceci près qu'il rend des promesses : aucun appelant n'utilisait les flux autrement qu'en en prenant la première valeur.
 *
 * Le transport est un jeton (`HTTP_BACKEND`) : `fetch` dans l'application, une doublure dans les tests (`http-testing.ts`).
 */

export class HttpHeaders {
  private readonly valeurs: ReadonlyMap<string, string>;

  constructor(
    init?: Record<string, string> | Headers | ReadonlyMap<string, string>,
  ) {
    const valeurs = new Map<string, string>();
    if (init instanceof Headers)
      init.forEach((v, k) => valeurs.set(k.toLowerCase(), v));
    else if (init instanceof Map)
      init.forEach((v, k) => valeurs.set(k.toLowerCase(), v));
    else if (init)
      for (const [k, v] of Object.entries(init))
        valeurs.set(k.toLowerCase(), v);
    this.valeurs = valeurs;
  }

  /** Rend un nouvel objet : celui-ci ne change pas. */
  set(nom: string, valeur: string): HttpHeaders {
    const copie = new Map(this.valeurs);
    copie.set(nom.toLowerCase(), valeur);
    return new HttpHeaders(copie);
  }

  get(nom: string): string | null {
    return this.valeurs.get(nom.toLowerCase()) ?? null;
  }

  has(nom: string): boolean {
    return this.valeurs.has(nom.toLowerCase());
  }

  keys(): string[] {
    return [...this.valeurs.keys()];
  }

  toRecord(): Record<string, string> {
    return Object.fromEntries(this.valeurs);
  }
}

export type ResponseType = "json" | "text" | "arraybuffer";

export interface HttpRequestOptions {
  readonly headers?: HttpHeaders | Record<string, string>;
  readonly responseType?: ResponseType;
  readonly body?: unknown;
  readonly cache?: RequestCache;
}

export interface HttpRequest {
  readonly method: string;
  readonly url: string;
  readonly headers: HttpHeaders;
  readonly body: unknown;
  readonly responseType: ResponseType;
  readonly cache?: RequestCache;
}

export class HttpResponse<T> {
  constructor(
    readonly status: number,
    readonly statusText: string,
    readonly headers: HttpHeaders,
    readonly body: T,
    readonly url: string,
  ) {}

  get ok(): boolean {
    return this.status >= 200 && this.status < 300;
  }
}

/** Un statut hors de 2xx, ou l'absence de réponse (`status` à 0). `error` porte le corps lu. */
export class HttpErrorResponse extends Error {
  constructor(
    readonly status: number,
    readonly statusText: string,
    readonly headers: HttpHeaders,
    readonly error: unknown,
    readonly url: string,
  ) {
    super(`Http failure response for ${url}: ${status} ${statusText}`);
  }

  get ok(): false {
    return false;
  }
}

/** Le transport : rend la réponse quel que soit son statut, et ne lève qu'en l'absence de réponse. */
export interface HttpBackend {
  handle(requete: HttpRequest): Promise<HttpResponse<unknown>>;
}

export class FetchBackend implements HttpBackend {
  async handle(requete: HttpRequest): Promise<HttpResponse<unknown>> {
    let reponse: Response;
    try {
      reponse = await fetch(requete.url, {
        method: requete.method,
        headers: requete.headers.toRecord(),
        body: encodeBody(requete.body),
        cache: requete.cache,
      });
    } catch (cause) {
      throw new HttpErrorResponse(
        0,
        "Unknown Error",
        new HttpHeaders(),
        cause,
        requete.url,
      );
    }
    const body = await readBody(reponse, requete.responseType);
    return new HttpResponse(
      reponse.status,
      reponse.statusText,
      new HttpHeaders(reponse.headers),
      body,
      requete.url,
    );
  }
}

function encodeBody(body: unknown): BodyInit | undefined {
  if (body === undefined || body === null) return undefined;
  if (
    typeof body === "string" ||
    body instanceof ArrayBuffer ||
    body instanceof Blob ||
    ArrayBuffer.isView(body)
  ) {
    return body as BodyInit;
  }
  if (body instanceof URLSearchParams || body instanceof FormData) return body;
  return JSON.stringify(body);
}

async function readBody(
  reponse: Response,
  type: ResponseType,
): Promise<unknown> {
  if (type === "arraybuffer") return reponse.arrayBuffer();
  const texte = await reponse.text();
  if (type === "text") return texte;
  if (!texte) return null;
  try {
    return JSON.parse(texte);
  } catch {
    // Un corps d'erreur n'est pas toujours du JSON : le garder tel quel plutôt que de perdre la cause.
    return texte;
  }
}

export const HTTP_BACKEND = new InjectionToken<HttpBackend>("HTTP_BACKEND", {
  factory: () => new FetchBackend(),
});

export class HttpClient {
  private readonly backend = inject(HTTP_BACKEND);

  async request<T>(
    method: string,
    url: string,
    options: HttpRequestOptions = {},
  ): Promise<HttpResponse<T>> {
    const headers =
      options.headers instanceof HttpHeaders
        ? options.headers
        : new HttpHeaders(options.headers);
    const requete: HttpRequest = {
      method: method.toUpperCase(),
      url,
      headers:
        options.body !== undefined &&
        !(typeof options.body === "string") &&
        !headers.has("content-type")
          ? headers.set("content-type", "application/json")
          : headers,
      body: options.body ?? null,
      responseType: options.responseType ?? "json",
      cache: options.cache,
    };
    const reponse = await this.backend.handle(requete);
    if (!reponse.ok) {
      throw new HttpErrorResponse(
        reponse.status,
        reponse.statusText,
        reponse.headers,
        reponse.body,
        url,
      );
    }
    return reponse as HttpResponse<T>;
  }

  get(
    url: string,
    options: Omit<HttpRequestOptions, "body"> & { responseType: "text" },
  ): Promise<HttpResponse<string>>;
  get(
    url: string,
    options: Omit<HttpRequestOptions, "body"> & {
      responseType: "arraybuffer";
    },
  ): Promise<HttpResponse<ArrayBuffer>>;
  get<T>(
    url: string,
    options?: Omit<HttpRequestOptions, "body">,
  ): Promise<HttpResponse<T>>;
  get<T>(
    url: string,
    options: Omit<HttpRequestOptions, "body"> = {},
  ): Promise<HttpResponse<T>> {
    return this.request<T>("GET", url, options);
  }

  post<T>(
    url: string,
    body: unknown,
    options: Omit<HttpRequestOptions, "body"> = {},
  ): Promise<HttpResponse<T>> {
    return this.request<T>("POST", url, { ...options, body });
  }

  put<T>(
    url: string,
    body: unknown,
    options: Omit<HttpRequestOptions, "body"> = {},
  ): Promise<HttpResponse<T>> {
    return this.request<T>("PUT", url, { ...options, body });
  }

  delete<T>(
    url: string,
    options: HttpRequestOptions = {},
  ): Promise<HttpResponse<T>> {
    return this.request<T>("DELETE", url, options);
  }
}
