import { InjectionToken, inject } from "../injection";

/**
 * The core's HTTP client, on `fetch`.
 *
 * It takes the shape of Angular's in what SSK Canon used of it — immutable headers, full response, error for any status outside 2xx, 304 included —, except that it returns promises: no caller used the streams other than by taking their first value.
 *
 * The transport is a token (`HTTP_BACKEND`): `fetch` in the application, a fake in tests (`http-testing.ts`).
 */

export class HttpHeaders {
  private readonly values: ReadonlyMap<string, string>;

  constructor(
    init?: Record<string, string> | Headers | ReadonlyMap<string, string>,
  ) {
    const values = new Map<string, string>();
    if (init instanceof Headers)
      init.forEach((v, k) => values.set(k.toLowerCase(), v));
    else if (init instanceof Map)
      init.forEach((v, k) => values.set(k.toLowerCase(), v));
    else if (init)
      for (const [k, v] of Object.entries(init)) values.set(k.toLowerCase(), v);
    this.values = values;
  }

  /** Returns a new object: this one does not change. */
  set(name: string, value: string): HttpHeaders {
    const copied = new Map(this.values);
    copied.set(name.toLowerCase(), value);
    return new HttpHeaders(copied);
  }

  get(name: string): string | null {
    return this.values.get(name.toLowerCase()) ?? null;
  }

  has(name: string): boolean {
    return this.values.has(name.toLowerCase());
  }

  keys(): string[] {
    return [...this.values.keys()];
  }

  toRecord(): Record<string, string> {
    return Object.fromEntries(this.values);
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

/** A status outside 2xx, or the absence of a response (`status` at 0). `error` carries the body read. */
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

/** The transport: returns the response whatever its status, and only throws when there is no response. */
export interface HttpBackend {
  handle(query: HttpRequest): Promise<HttpResponse<unknown>>;
}

export class FetchBackend implements HttpBackend {
  async handle(query: HttpRequest): Promise<HttpResponse<unknown>> {
    let response: Response;
    try {
      response = await fetch(query.url, {
        method: query.method,
        headers: query.headers.toRecord(),
        body: encodeBody(query.body),
        cache: query.cache,
      });
    } catch (cause) {
      throw new HttpErrorResponse(
        0,
        "Unknown Error",
        new HttpHeaders(),
        cause,
        query.url,
      );
    }
    const body = await readBody(response, query.responseType);
    return new HttpResponse(
      response.status,
      response.statusText,
      new HttpHeaders(response.headers),
      body,
      query.url,
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
  response: Response,
  type: ResponseType,
): Promise<unknown> {
  if (type === "arraybuffer") return response.arrayBuffer();
  const text = await response.text();
  if (type === "text") return text;
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    // An error body is not always JSON: keep it as is rather than lose the cause.
    return text;
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
    const query: HttpRequest = {
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
    const response = await this.backend.handle(query);
    if (!response.ok) {
      throw new HttpErrorResponse(
        response.status,
        response.statusText,
        response.headers,
        response.body,
        url,
      );
    }
    return response as HttpResponse<T>;
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
