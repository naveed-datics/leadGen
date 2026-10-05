import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import { fetchApifyWebsiteStatsBatch } from "./apify-traffic";

const realFetch = globalThis.fetch;
const realToken = process.env.APIFY_API_TOKEN;
const realActor = process.env.APIFY_TRAFFIC_ACTOR_ID;

let calls: { url: string; body: unknown }[] = [];

function mockFetch(rows: unknown) {
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({
      url: String(url),
      body: init?.body ? JSON.parse(String(init.body)) : null,
    });
    return new Response(JSON.stringify(rows), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;
}

beforeEach(() => {
  calls = [];
  process.env.APIFY_API_TOKEN = "test-token";
  delete process.env.APIFY_TRAFFIC_ACTOR_ID;
});

afterEach(() => {
  globalThis.fetch = realFetch;
  if (realToken === undefined) delete process.env.APIFY_API_TOKEN;
  else process.env.APIFY_API_TOKEN = realToken;
  if (realActor === undefined) delete process.env.APIFY_TRAFFIC_ACTOR_ID;
  else process.env.APIFY_TRAFFIC_ACTOR_ID = realActor;
});

test("batch makes one actor request carrying every domain", async () => {
  mockFetch([
    { domain: "a.com", totalVisits: 1000 },
    { domain: "b.com", totalVisits: 2000 },
    { domain: "c.com", totalVisits: 3000 },
  ]);

  const result = await fetchApifyWebsiteStatsBatch([
    "https://a.com",
    "https://www.b.com/",
    "https://c.com",
  ]);

  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].body, { domains: ["a.com", "b.com", "c.com"] });
  assert.equal(result.get("https://a.com")?.trafficEstimate, "1,000 visits/mo");
  assert.equal(result.get("https://www.b.com/")?.trafficEstimate, "2,000 visits/mo");
  assert.equal(result.get("https://c.com")?.trafficEstimate, "3,000 visits/mo");
});

test("batch flags a site the actor returned no row for", async () => {
  mockFetch([{ domain: "a.com", totalVisits: 1000 }]);

  const result = await fetchApifyWebsiteStatsBatch([
    "https://a.com",
    "https://missing.com",
  ]);

  assert.equal(calls.length, 1);
  assert.equal(result.get("https://a.com")?.trafficEstimate, "1,000 visits/mo");
  assert.match(
    result.get("https://missing.com")?.trafficError ?? "",
    /No traffic data/,
  );
});

test("batch with no sites makes no request", async () => {
  mockFetch([]);
  const result = await fetchApifyWebsiteStatsBatch([]);
  assert.equal(calls.length, 0);
  assert.equal(result.size, 0);
});
