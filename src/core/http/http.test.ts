import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { inject } from "../injection";
import {
  FetchBackend,
  HttpClient,
  HttpErrorResponse,
  HttpHeaders,
  type HttpRequest,
} from "./http";
import { provideHttpTesting } from "./http-testing";

describe("HttpClient", () => {
  it("emits the request at call time, with its headers", async () => {
    const http = provideHttpTesting();
    const pending = inject(HttpClient).get<{ sha: string }>(
      "https://api.github.com/x",
      {
        headers: new HttpHeaders({ Accept: "application/json" }).set(
          "Authorization",
          "Bearer t",
        ),
      },
    );
    const query = http.expectOne("https://api.github.com/x");
    expect(query.request.headers.get("authorization")).toBe("Bearer t");
    query.flush({ sha: "abc" }, { headers: { ETag: '"e1"' } });
    const response = await pending;
    expect(response.body.sha).toBe("abc");
    expect(response.headers.get("etag")).toBe('"e1"');
  });

  it("throws for a status outside 2xx, 304 included, keeping the body and the headers", async () => {
    const http = provideHttpTesting();
    const pending = inject(HttpClient).get("https://api.github.com/y");
    http
      .expectOne("https://api.github.com/y")
      .flush(null, { status: 304, headers: { "x-ratelimit-remaining": "59" } });
    const error = await pending.catch((e: unknown) => e);
    expect(error).toBeInstanceOf(HttpErrorResponse);
    expect((error as HttpErrorResponse).status).toBe(304);
    expect(
      (error as HttpErrorResponse).headers.get("x-ratelimit-remaining"),
    ).toBe("59");
  });

  it("tells the absence of a response from a refusal", async () => {
    const http = provideHttpTesting();
    const pending = inject(HttpClient).get(
      "https://raw.githubusercontent.com/z",
    );
    http
      .expectOne("https://raw.githubusercontent.com/z")
      .error(new ProgressEvent("error"));
    const error = (await pending.catch((e: unknown) => e)) as HttpErrorResponse;
    expect(error).toBeInstanceOf(HttpErrorResponse);
    expect(error.status).toBe(0);
    expect(error.error).toBeInstanceOf(ProgressEvent);
  });

  it("encodes an object body as JSON", async () => {
    const http = provideHttpTesting();
    void inject(HttpClient).post("https://api.github.com/graphql", {
      query: "{}",
    });
    const query = http.expectOne({
      method: "POST",
      url: "https://api.github.com/graphql",
    });
    expect(query.request.headers.get("content-type")).toBe("application/json");
    expect(query.request.body).toEqual({ query: "{}" });
  });
});

describe("HttpClient's other verbs", () => {
  it("sends a PUT with its body, and a DELETE with its options", async () => {
    const http = provideHttpTesting();
    void inject(HttpClient).put("https://api.github.com/a", { x: 1 });
    void inject(HttpClient).delete("https://api.github.com/b", {
      headers: { "X-Essai": "1" },
    });

    const put = http.expectOne({
      method: "PUT",
      url: "https://api.github.com/a",
    });
    expect(put.request.body).toEqual({ x: 1 });
    const del = http.expectOne({
      method: "DELETE",
      url: "https://api.github.com/b",
    });
    expect(del.request.headers.get("x-essai")).toBe("1");
  });
});

describe("HttpHeaders", () => {
  it("reads its names without regard to case, from a Headers or a Map", () => {
    expect(new HttpHeaders(new Headers({ ETag: "e" })).get("etag")).toBe("e");
    expect(new HttpHeaders(new Map([["Link", "l"]])).get("LINK")).toBe("l");
  });
});

/**
 * The transport the application really uses: `fetch`. Every test above goes through the fake one, so this is the only place the encoding of a request and the reading of a response are checked.
 */
describe("FetchBackend", () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  function query(over: Partial<HttpRequest> = {}): HttpRequest {
    return {
      method: "GET",
      url: "https://api.github.com/x",
      headers: new HttpHeaders({ Accept: "application/json" }),
      body: null,
      responseType: "json",
      ...over,
    };
  }

  /** What `fetch` was given. */
  function sent(): RequestInit {
    return fetchMock.mock.calls[0][1] ?? {};
  }

  it("sends the method, the headers and the cache mode", async () => {
    fetchMock.mockResolvedValueOnce(new Response("{}"));

    await new FetchBackend().handle(
      query({ method: "POST", cache: "no-cache" }),
    );

    expect(fetchMock.mock.calls[0][0]).toBe("https://api.github.com/x");
    expect(sent()).toMatchObject({
      method: "POST",
      headers: { accept: "application/json" },
      cache: "no-cache",
    });
  });

  it("encodes an object as JSON, and sends nothing for no body", async () => {
    // A response is read once: one per call.
    fetchMock.mockImplementation(async () => new Response("{}"));

    await new FetchBackend().handle(query({ body: { a: [1, "é"] } }));
    await new FetchBackend().handle(query({ body: null }));

    expect(fetchMock.mock.calls[0][1]?.body).toBe('{"a":[1,"é"]}');
    expect(fetchMock.mock.calls[1][1]?.body).toBeUndefined();
  });

  it.each([
    ["a string", "texte brut"],
    ["bytes", new Uint8Array([1, 2, 3])],
    ["an ArrayBuffer", new ArrayBuffer(4)],
    ["a form", new URLSearchParams({ code: "c" })],
  ])("sends %s as it is", async (_label, body) => {
    fetchMock.mockResolvedValueOnce(new Response("{}"));

    await new FetchBackend().handle(query({ body }));

    expect(sent().body).toBe(body);
  });

  it("reads JSON, keeps the status and the headers, and does not throw on an error status", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response('{"message":"Not Found"}', {
        status: 404,
        statusText: "Not Found",
        headers: { "X-RateLimit-Remaining": "41" },
      }),
    );

    const response = await new FetchBackend().handle(query());

    expect(response.status).toBe(404);
    expect(response.statusText).toBe("Not Found");
    expect(response.body).toEqual({ message: "Not Found" });
    expect(response.headers.get("x-ratelimit-remaining")).toBe("41");
    expect(response.url).toBe("https://api.github.com/x");
  });

  it("reads an empty JSON body as null", async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));

    expect((await new FetchBackend().handle(query())).body).toBeNull();
  });

  it("keeps a body that is not JSON as text, rather than losing the cause", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response("<html>Bad gateway</html>", { status: 502 }),
    );

    expect((await new FetchBackend().handle(query())).body).toBe(
      "<html>Bad gateway</html>",
    );
  });

  it("returns text as text, even when it looks like JSON", async () => {
    fetchMock.mockResolvedValueOnce(new Response('{"a":1}'));

    expect(
      (await new FetchBackend().handle(query({ responseType: "text" }))).body,
    ).toBe('{"a":1}');
  });

  it("returns bytes as an ArrayBuffer", async () => {
    fetchMock.mockResolvedValueOnce(new Response(new Uint8Array([7, 8])));

    const body = (
      await new FetchBackend().handle(query({ responseType: "arraybuffer" }))
    ).body as ArrayBuffer;

    expect([...new Uint8Array(body)]).toEqual([7, 8]);
  });

  it("turns the absence of a response into a status 0 that carries the cause", async () => {
    const cause = new TypeError("Failed to fetch");
    fetchMock.mockRejectedValueOnce(cause);

    const error = (await new FetchBackend()
      .handle(query())
      .catch((e: unknown) => e)) as HttpErrorResponse;

    expect(error).toBeInstanceOf(HttpErrorResponse);
    expect(error.status).toBe(0);
    expect(error.error).toBe(cause);
    expect(error.url).toBe("https://api.github.com/x");
  });
});
