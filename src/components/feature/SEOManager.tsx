import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { getSEO, buildCanonical } from "../../config/seoConfig";

/**
 * SEOManager
 *
 * Imperatively keeps <title>, <meta name="description">, <link rel="canonical">,
 * and core og/twitter tags in sync with the current route. Runs on every SPA
 * route change so the static index.html defaults (homepage canonical, default
 * title) cannot bleed into other pages.
 *
 * Pages that set their own title/description/canonical (blog post, state ESA
 * page, etc.) will still win, because those pages mount AFTER this runs and
 * overwrite the same tags. SEOManager guarantees a correct fallback and — on
 * pages with no explicit meta — provides the centralized doc-sourced values.
 *
 * Also always forces the canonical to be self-referencing for each route,
 * fixing the bug where every page previously canonicalized to the homepage.
 */

const PAGE_TITLE_FALLBACK = "PawTenant — Legitimate ESA Letters";
const PAGE_DESC_FALLBACK =
  "Get a legitimate ESA letter from licensed mental health professionals. Valid in all US states.";

function setMetaByName(name: string, content: string) {
  let el = document.head.querySelector(
    `meta[name="${name}"]`
  ) as HTMLMetaElement | null;
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute("name", name);
    document.head.appendChild(el);
  }
  if (el.getAttribute("content") !== content) {
    el.setAttribute("content", content);
  }
}

function setMetaByProperty(property: string, content: string) {
  let el = document.head.querySelector(
    `meta[property="${property}"]`
  ) as HTMLMetaElement | null;
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute("property", property);
    document.head.appendChild(el);
  }
  if (el.getAttribute("content") !== content) {
    el.setAttribute("content", content);
  }
}

function setCanonical(href: string) {
  let el = document.head.querySelector(
    'link[rel="canonical"]'
  ) as HTMLLinkElement | null;
  if (!el) {
    el = document.createElement("link");
    el.setAttribute("rel", "canonical");
    document.head.appendChild(el);
  }
  if (el.getAttribute("href") !== href) {
    el.setAttribute("href", href);
  }
}

function setOgUrl(href: string) {
  setMetaByProperty("og:url", href);
}

export default function SEOManager() {
  const { pathname } = useLocation();

  useEffect(() => {
    const entry = getSEO(pathname);
    const canonical = buildCanonical(pathname);

    const title = entry?.title ?? PAGE_TITLE_FALLBACK;
    const description = entry?.description ?? PAGE_DESC_FALLBACK;

    if (document.title !== title) {
      document.title = title;
    }

    setMetaByName("description", description);
    setCanonical(canonical);

    setMetaByProperty("og:title", title);
    setMetaByProperty("og:description", description);
    setOgUrl(canonical);

    setMetaByName("twitter:title", title);
    setMetaByName("twitter:description", description);
  }, [pathname]);

  return null;
}
