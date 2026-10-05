import assert from "node:assert/strict";
import { test } from "node:test";
import { matchTemplate, slugCandidates, slugify } from "./wp-network";

const templates = [
  { id: 2, title: "Plumbing Pro", slug: "plumbing", url: "https://x/plumbing/" },
  { id: 3, title: "House Cleaning", slug: "cleaning", url: "https://x/cleaning/" },
];

test("slugify collapses punctuation and trims dashes", () => {
  assert.equal(slugify("  Joe's Plumbing & Heating! "), "joe-s-plumbing-heating");
});

test("slugCandidates appends numeric suffixes after the first attempt", () => {
  assert.deepEqual(slugCandidates("Acme Co").slice(0, 3), [
    "acme-co",
    "acme-co-2",
    "acme-co-3",
  ]);
});

test("slugCandidates falls back to demo for empty names", () => {
  assert.equal(slugCandidates("!!!")[0], "demo");
});

test("matchTemplate matches id, then slug, then title case-insensitively", () => {
  assert.equal(matchTemplate(templates, "3")?.slug, "cleaning");
  assert.equal(matchTemplate(templates, "PLUMBING")?.id, 2);
  assert.equal(matchTemplate(templates, "house cleaning")?.id, 3);
});

test("matchTemplate loosely matches a unique shared keyword", () => {
  assert.equal(matchTemplate(templates, "Cleaning Services")?.id, 3);
});

test("matchTemplate refuses ambiguous loose matches", () => {
  const two = [
    ...templates,
    { id: 4, title: "Window Cleaning", slug: "window-cleaning", url: "https://x/w/" },
  ];
  assert.equal(matchTemplate(two, "Cleaning Services"), null);
});

test("matchTemplate returns null for unknown or empty input", () => {
  assert.equal(matchTemplate(templates, "roofing"), null);
  assert.equal(matchTemplate(templates, ""), null);
});
