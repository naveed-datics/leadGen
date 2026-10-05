import { isSocialWebsiteUrl } from "@/lib/social-urls";

/**
 * Hosts that list or sell many businesses (directories, review sites,
 * marketplaces, booking/link-in-bio pages). A competitor on one of these has
 * no website of its own, so its traffic stats say nothing about the business.
 */
const PLATFORM_HOSTS = new Set([
  "google.com",
  "goo.gl",
  "business.site",
  "yelp.com",
  "tripadvisor.com",
  "yellowpages.com",
  "yell.com",
  "foursquare.com",
  "mapquest.com",
  "bing.com",
  "justdial.com",
  "dubizzle.com",
  "olx.com",
  "amazon.com",
  "ebay.com",
  "etsy.com",
  "alibaba.com",
  "linktr.ee",
  "linktree.com",
  "beacons.ai",
  "booksy.com",
  "fresha.com",
  "treatwell.com",
  "booking.com",
  "wikipedia.org",
]);

function hostnameOf(url: string): string | null {
  try {
    const trimmed = url.trim();
    const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    return new URL(withProtocol).hostname.toLowerCase();
  } catch {
    return null;
  }
}

/**
 * True when the URL belongs to a social network or a listing/marketplace
 * platform rather than the business's own website.
 */
export function isPlatformWebsiteUrl(url: string | null | undefined): boolean {
  if (!url?.trim()) return false;
  if (isSocialWebsiteUrl(url)) return true;

  const host = hostnameOf(url);
  if (host == null) return false;
  for (const known of PLATFORM_HOSTS) {
    if (host === known || host.endsWith(`.${known}`)) return true;
  }
  return false;
}
