import { useEffect } from "react";
import { useLocation } from "react-router-dom";

/** Pages a search engine may list. Everything else is someone's private workspace. */
const PUBLIC_PATHS = new Set(["/login", "/privacy"]);

/**
 * Sets the robots meta tag per page.
 *
 * index.html used to say "noindex, nofollow" for the whole site, so U.Do could
 * not appear in search at all — not even its privacy policy. The login and
 * privacy pages are now indexable; every signed-in page still asks not to be,
 * since there is nothing on them for a search engine and nothing anyone
 * should find there. Google renders the app before indexing, so it reads the
 * tag as set here.
 */
export default function IndexingPolicy() {
  const { pathname } = useLocation();

  useEffect(() => {
    let tag = document.querySelector('meta[name="robots"]');
    if (!tag) {
      tag = document.createElement("meta");
      tag.name = "robots";
      document.head.appendChild(tag);
    }
    tag.content = PUBLIC_PATHS.has(pathname) ? "index, follow" : "noindex, nofollow";
  }, [pathname]);

  return null;
}
