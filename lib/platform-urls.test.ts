import assert from "node:assert/strict";
import { test } from "node:test";
import { isPlatformWebsiteUrl } from "./platform-urls";

test("flags social, directory and marketplace links as platforms", () => {
  for (const url of [
    "https://www.facebook.com/somebiz",
    "https://instagram.com/somebiz",
    "https://www.yelp.com/biz/some-biz",
    "https://maps.google.com/?cid=1",
    "https://somebiz.business.site",
    "https://linktr.ee/somebiz",
    "www.tripadvisor.com/Restaurant_Review-x",
  ]) {
    assert.equal(isPlatformWebsiteUrl(url), true, url);
  }
});

test("keeps a business's own site, including free-builder subdomains", () => {
  for (const url of [
    "https://alliedfm.me/",
    "http://www.unitedpestservice.com/",
    "https://somebiz.wixsite.com/home",
    "somebiz.ae",
  ]) {
    assert.equal(isPlatformWebsiteUrl(url), false, url);
  }
});

test("does not treat look-alike hosts as platforms", () => {
  assert.equal(isPlatformWebsiteUrl("https://notfacebook.com"), false);
  assert.equal(isPlatformWebsiteUrl("https://mygoogle.com.biz"), false);
  assert.equal(isPlatformWebsiteUrl(""), false);
  assert.equal(isPlatformWebsiteUrl(null), false);
});
