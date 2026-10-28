import type { CollectionEntry } from "astro:content";
import config from "@/config";

export type DayGroup = {
  day: string;
  dateKey: string;
  dateLabel: string;
  posts: CollectionEntry<"posts">[];
};

export type MonthGroup = {
  month: string;
  monthKey: string;
  monthLabel: string;
  totalPosts: number;
  days: DayGroup[];
};

export type YearGroup = {
  year: string;
  yearKey: string;
  yearLabel: string;
  totalPosts: number;
  months: MonthGroup[];
};

export type TimelineJumpTarget = {
  id: string;
  type: "year" | "month" | "day";
  label: string;
  count: number;
};

export type TimelineHierarchyResult = {
  years: YearGroup[];
  jumpTargets: TimelineJumpTarget[];
};

/**
 * Groups posts hierarchically into Year (大圆点) -> Month (中圆点) -> Day (小圆点)
 */
export function getTimelineHierarchy(
  posts: CollectionEntry<"posts">[],
  locale: string = config.site.lang ?? "zh",
  timeZone: string = config.site.timezone ?? "Asia/Shanghai"
): TimelineHierarchyResult {
  if (!posts || posts.length === 0) {
    return { years: [], jumpTargets: [] };
  }

  const isZh = locale.startsWith("zh");
  const monthFormatterEn = new Intl.DateTimeFormat("en", {
    timeZone,
    month: "short",
  });

  const yearMap = new Map<
    string,
    {
      year: string;
      yearLabel: string;
      totalPosts: number;
      monthMap: Map<
        string,
        {
          month: string;
          monthLabel: string;
          totalPosts: number;
          dayMap: Map<
            string,
            {
              day: string;
              dateLabel: string;
              dateKey: string;
              posts: CollectionEntry<"posts">[];
            }
          >;
        }
      >;
    }
  >();

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

    const yearLabel = isZh ? `${y} 年` : y;
    const monthLabel = isZh ? `${Number(m)} 月` : monthFormatterEn.format(d);
    const dateLabel = isZh ? `${Number(day)} 日` : `${monthLabel} ${Number(day)}`;
    const dateKey = `${y}-${m}-${day}`;

    if (!yearMap.has(y)) {
      yearMap.set(y, {
        year: y,
        yearLabel,
        totalPosts: 0,
        monthMap: new Map(),
      });
    }
    const yearObj = yearMap.get(y)!;
    yearObj.totalPosts += 1;

    if (!yearObj.monthMap.has(m)) {
      yearObj.monthMap.set(m, {
        month: m,
        monthLabel,
        totalPosts: 0,
        dayMap: new Map(),
      });
    }
    const monthObj = yearObj.monthMap.get(m)!;
    monthObj.totalPosts += 1;

    if (!monthObj.dayMap.has(day)) {
      monthObj.dayMap.set(day, {
        day,
        dateLabel,
        dateKey,
        posts: [],
      });
    }
    const dayObj = monthObj.dayMap.get(day)!;
    dayObj.posts.push(post);
  });

  const years: YearGroup[] = Array.from(yearMap.values()).map(y => ({
    year: y.year,
    yearKey: y.year,
    yearLabel: y.yearLabel,
    totalPosts: y.totalPosts,
    months: Array.from(y.monthMap.values()).map(m => ({
      month: m.month,
      monthKey: `${y.year}-${m.month}`,
      monthLabel: m.monthLabel,
      totalPosts: m.totalPosts,
      days: Array.from(m.dayMap.values()),
    })),
  }));

  // Generate jump targets for quick navigation
  const jumpTargets: TimelineJumpTarget[] = [];
  years.forEach(y => {
    // If multiple years exist, add year jump target
    if (years.length > 1) {
      jumpTargets.push({
        id: `year-${y.year}`,
        type: "year",
        label: y.yearLabel,
        count: y.totalPosts,
      });
    }

    y.months.forEach(m => {
      jumpTargets.push({
        id: `month-${y.year}-${m.month}`,
        type: "month",
        label: `${y.year} · ${m.monthLabel}`,
        count: m.totalPosts,
      });
    });
  });

  return { years, jumpTargets };
}
