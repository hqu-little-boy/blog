import type { CollectionEntry } from "astro:content";

/**
 * Determines whether a post is eligible to be listed/rendered.
 *
 * - Excludes drafts always
 */
export function postFilter({ data }: CollectionEntry<"posts">) {
  return !data.draft;
}

