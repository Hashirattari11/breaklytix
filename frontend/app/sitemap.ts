import type { MetadataRoute } from "next";
import { allEntries } from "@/lib/sitemap";

// Public marketing/legal/docs pages only — private/authenticated routes
// (dashboard, admin, auth, authorize) and noindexed pages (/login) are never
// listed.
export default function sitemap(): MetadataRoute.Sitemap {
  return allEntries();
}
