import { describe, expect, it } from "vitest";
import { inject } from "../injection";
import { HttpClient, HttpErrorResponse, HttpHeaders } from "./http";
import { provideHttpTesting } from "./http-testing";

describe("HttpClient", () => {
  it("émet la requête au moment de l'appel, avec ses en-têtes", async () => {
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

  it("lève pour un statut hors de 2xx, 304 compris, en gardant le corps et les en-têtes", async () => {
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

  it("distingue l'absence de réponse d'un refus", async () => {
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

  it("encode un corps d'objet en JSON", async () => {
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
