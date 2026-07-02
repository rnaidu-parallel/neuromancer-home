/**
 * writing.ts — span 04 (memory: recall("writing")) data, resolved at BUILD time.
 *
 * getWriting() fetches the live RSS 2.0 feed at blog.neuromancer.in, parses the
 * top 4 items with a dependency-free regex pass, and attaches a diegetic
 * relevance score derived purely from recency (see below). ANY failure — network
 * error, non-200, parse error, or zero items — logs a single warning and falls
 * back to the committed snapshot in writing-fallback.json. The build must NEVER
 * fail from this call.
 *
 * The relevance score is honest playfulness: it is literally just recency
 * (0.98, 0.91, 0.84, 0.77 by position), and the page footnotes it as such.
 */
import fallback from './writing-fallback.json';

export interface WritingItem {
  title: string;
  url: string;
  date: string;
  /** diegetic relevance = recency rank; footnoted on the page as such */
  score: number;
}

type RawItem = { title: string; url: string; date: string };

const RSS_URL = process.env.WRITING_RSS_URL ?? 'https://blog.neuromancer.in/rss.xml';
const FETCH_TIMEOUT_MS = 10_000;

/** Decode the handful of XML/HTML entities that show up in post titles. */
function decodeEntities(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

function tag(block: string, name: string): string | null {
  const m = block.match(new RegExp(`<${name}\\b[^>]*>([\\s\\S]*?)</${name}>`));
  return m ? decodeEntities(m[1]!).trim() : null;
}

/** Parse RSS 2.0 <item> blocks into raw items. Throws on structural failure. */
function parseRss(xml: string): RawItem[] {
  const blocks = [...xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/g)];
  const items: RawItem[] = [];
  for (const [, block] of blocks) {
    const title = tag(block!, 'title');
    const link = tag(block!, 'link');
    const pubDate = tag(block!, 'pubDate');
    if (!title || !link || !pubDate) continue;
    const d = new Date(pubDate);
    if (Number.isNaN(d.getTime())) continue;
    items.push({ title, url: link, date: d.toISOString().slice(0, 10) });
  }
  return items;
}

async function fetchWriting(): Promise<RawItem[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(RSS_URL, { signal: controller.signal });
    if (!res.ok) throw new Error(`http ${res.status}`);
    const xml = await res.text();
    const items = parseRss(xml);
    if (!items.length) throw new Error('zero items parsed');
    return items;
  } finally {
    clearTimeout(timer);
  }
}

/** Recency-only relevance: 0.98, 0.91, 0.84, 0.77 by position. Deterministic. */
function withScores(raw: RawItem[]): WritingItem[] {
  return raw.slice(0, 4).map((r, i) => ({ ...r, score: 0.98 - 0.07 * i }));
}

export async function getWriting(): Promise<WritingItem[]> {
  try {
    return withScores(await fetchWriting());
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    console.warn(`[writing] rss fetch failed, using fallback: ${reason}`);
    return withScores(fallback as RawItem[]);
  }
}
