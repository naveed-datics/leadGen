import assert from "node:assert/strict";
import { test } from "node:test";
import { capWindowStart, effectiveDailyCap, remainingToday } from "./cap";
import { normalizeFacebookPageUrl, pickFacebookPageUrl } from "./facebook-url";
import { renderOutreachMessage } from "./template";
import { bearerToken, generateExtensionToken, tokensMatch } from "./token";

test("normalizes page slugs and drops deep links", () => {
  assert.equal(
    normalizeFacebookPageUrl("m.facebook.com/AcmePlumbing/posts/123?x=1"),
    "https://www.facebook.com/AcmePlumbing",
  );
  assert.equal(
    normalizeFacebookPageUrl("https://facebook.com/profile.php?id=1000123&ref=x"),
    "https://www.facebook.com/profile.php?id=1000123",
  );
});

test("rejects groups, share links, non-facebook and empty input", () => {
  assert.equal(normalizeFacebookPageUrl("https://facebook.com/groups/abc"), null);
  assert.equal(normalizeFacebookPageUrl("https://facebook.com/sharer/sharer.php?u=1"), null);
  assert.equal(normalizeFacebookPageUrl("https://instagram.com/acme"), null);
  assert.equal(normalizeFacebookPageUrl("https://facebook.com/"), null);
  assert.equal(normalizeFacebookPageUrl("  "), null);
  assert.equal(normalizeFacebookPageUrl(null), null);
});

test("picks the first usable candidate", () => {
  assert.equal(
    pickFacebookPageUrl([null, "https://instagram.com/x", "facebook.com/Acme"]),
    "https://www.facebook.com/Acme",
  );
  assert.equal(pickFacebookPageUrl([]), null);
});

test("cap defaults to 10, is clamped to the hard max, never negative", () => {
  assert.equal(effectiveDailyCap(undefined), 10);
  assert.equal(effectiveDailyCap(500), 30);
  assert.equal(effectiveDailyCap(-3), 0);
  assert.equal(remainingToday(10, 4), 6);
  assert.equal(remainingToday(10, 12), 0);
});

test("cap window is a rolling 24h", () => {
  const now = new Date("2026-01-02T12:00:00Z");
  assert.equal(capWindowStart(now).toISOString(), "2026-01-01T12:00:00.000Z");
});

test("renders all placeholders", () => {
  assert.equal(
    renderOutreachMessage("Hi {{businessName}} from {{senderName}} ({{industry}}) {{businessName}}", {
      businessName: "Acme",
      industry: "plumbers",
      senderName: "Sam",
    }),
    "Hi Acme from Sam (plumbers) Acme",
  );
});

test("token hashing round-trips and rejects wrong tokens", () => {
  const { token, hash } = generateExtensionToken();
  assert.ok(tokensMatch(token, hash));
  assert.ok(!tokensMatch(`${token}x`, hash));
  assert.ok(!tokensMatch(token, null));
  assert.equal(bearerToken(`Bearer ${token}`), token);
  assert.equal(bearerToken("Basic abc"), null);
  assert.equal(bearerToken(null), null);
});
