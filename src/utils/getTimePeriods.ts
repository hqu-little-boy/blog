import type { CollectionEntry } from "astro:content";
import config from "@/config";

export type TimePeriod = {
  id: string;
  label: string;
  shortLabel: string;
  count: number;
  posts: CollectionEntry<"posts">[];
};

/**
 * Intelligently groups posts into time periods based on their temporal distribution.
 *
 * Strategy:
 * - If posts span >= 3 distinct years: group by Year (e.g. "2026 年")
 * - Else if posts span >= 2 distinct year-months: group by Year-Month (e.g. "2026 年 10 月")
 * - Else if posts span >= 2 distinct dates: group by Date (e.g. "10 月 27 日")
 * - Else (e.g. all on same day): group individually by post
 */
export function getTimePeriods(
  posts: CollectionEntry<"posts">[],
  locale: string = config.site.lang ?? "zh",
  timeZone: string = config.site.timezone ?? "Asia/Shanghai"
): TimePeriod[] {
  if (!posts || posts.length === 0) return [];

  const yearFormatter = new Intl.DateTimeFormat(locale, {
    timeZone,
    year: "numeric",
  });
  const monthFormatter = new Intl.DateTimeFormat(locale, {
    timeZone,
    year: "numeric",
    month: "long",
  });
  const dateFormatter = new Intl.DateTimeFormat(locale, {
    timeZone,
    month: "long",
    day: "numeric",
  });

  const years = new Set<string>();
  const yearMonths = new Set<string>();
  const dates = new Set<string>();

  posts.forEach(post => {
    const d = new Date(post.data.pubDatetime);
    // Format ISO-like tokens for grouping keys in current timezone
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(d);

    const y = parts.find(p => p.type === "year")?.value || "";
    const m = parts.find(p => p.type === "month")?.value || "";
    const day = parts.find(p => p.type === "day")?.value || "";

    years.add(y);
    yearMonths.add(`${y}-${m}`);
    dates.add(`${y}-${m}-${day}`);
  });

  let mode: "year" | "yearMonth" | "date" = "date";
  if (years.size >= 3) {
    mode = "year";
  } else if (yearMonths.size >= 2) {
    mode = "yearMonth";
  } else if (dates.size >= 2) {
    mode = "date";
  } else {
    mode = "date";
  }

  const groupMap = new Map<string, TimePeriod>();

  posts.forEach(post => {
    const d = new Date(post.data.pubDatetime);
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(d);

    const y = parts.find(p => p.type === "year")?.value || "";
    const m = parts.find(p => p.type === "month")?.value || "";
    const day = parts.find(p => p.type === "day")?.value || "";

    let key = "";
    let label = "";
    let shortLabel = "";

    if (mode === "year") {
      key = `year-${y}`;
      label = yearFormatter.format(d);
      shortLabel = y;
    } else if (mode === "yearMonth") {
      key = `month-${y}-${m}`;
      label = monthFormatter.format(d);
      shortLabel = `${y}.${m}`;
    } else {
      key = `date-${y}-${m}-${day}`;
      label = dateFormatter.format(d);
      shortLabel = `${m}-${day}`;
    }

    if (!groupMap.has(key)) {
      groupMap.set(key, {
        id: key,
        label,
        shortLabel,
        count: 0,
        posts: [],
      });
    }

    const group = groupMap.get(key)!;
    group.count += 1;
    group.posts.push(post);
  });

  return Array.from(groupMap.values());
}
