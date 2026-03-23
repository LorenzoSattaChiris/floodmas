import { AtpAgent, AppBskyFeedDefs } from '@atproto/api';
import { getCached, setCache } from './cache.js';

/** Shared AT Protocol agent using the direct AppView (bypasses CDN cache) */
const agent = new AtpAgent({ service: 'https://api.bsky.app' });

export interface BlueskyPost {
  uri: string;
  cid: string;
  author: {
    did: string;
    handle: string;
    displayName?: string;
    avatar?: string;
  };
  record: {
    text: string;
    createdAt: string;
    langs?: string[];
  };
  indexedAt: string;
  likeCount?: number;
  repostCount?: number;
  replyCount?: number;
}

export interface BlueskySearchResult {
  posts: BlueskyPost[];
  hitsTotal?: number;
  cursor?: string;
}

const FOCUSED_QUERIES = [
  'flood UK',
  'flooding',
  'flood warning',
  'flood alert',
];

const BROAD_QUERIES = [
  ...FOCUSED_QUERIES,
  'flood damage',
  'river flooding',
  'storm flood',
  'flash flood',
  'heavy rain UK',
  'rain flooding',
  'storm UK',
  'weather warning UK',
  'flood water',
  'flood rescue',
];

/** Map SDK postView to our simplified BlueskyPost */
function toBlueskyPost(pv: AppBskyFeedDefs.PostView): BlueskyPost {
  const rec = pv.record as Record<string, unknown>;
  return {
    uri: pv.uri,
    cid: pv.cid,
    author: {
      did: pv.author.did,
      handle: pv.author.handle,
      displayName: pv.author.displayName,
      avatar: pv.author.avatar,
    },
    record: {
      text: (rec?.text as string) ?? '',
      createdAt: (rec?.createdAt as string) ?? pv.indexedAt,
      langs: rec?.langs as string[] | undefined,
    },
    indexedAt: pv.indexedAt,
    likeCount: pv.likeCount,
    repostCount: pv.repostCount,
    replyCount: pv.replyCount,
  };
}

/** Search Bluesky for UK flood-related posts using the AT Protocol SDK */
export async function searchFloodPosts(
  limit = 25,
  mode: 'focused' | 'broad' = 'focused',
): Promise<BlueskySearchResult> {
  const cacheKey = `social:feed:${mode}:${limit}`;
  const cached = getCached<BlueskySearchResult>(cacheKey);
  if (cached) return cached.data;

  const queries = mode === 'broad' ? BROAD_QUERIES : FOCUSED_QUERIES;
  const perQuery = Math.min(15, Math.ceil(limit / queries.length) + 5);

  // Run multiple searches in parallel
  const results = await Promise.allSettled(
    queries.map(async (q) => {
      const res = await agent.app.bsky.feed.searchPosts({
        q,
        sort: 'latest',
        limit: perQuery,
      });
      return res.data;
    }),
  );

  // Deduplicate posts by URI and sort by date
  const seen = new Set<string>();
  const allPosts: BlueskyPost[] = [];
  let totalHits = 0;

  for (const result of results) {
    if (result.status !== 'fulfilled') continue;
    const data = result.value;
    totalHits += data.hitsTotal ?? data.posts.length;
    for (const pv of data.posts) {
      if (!seen.has(pv.uri)) {
        seen.add(pv.uri);
        allPosts.push(toBlueskyPost(pv));
      }
    }
  }

  // Sort newest first
  allPosts.sort((a, b) => {
    const ta = new Date(a.record?.createdAt || a.indexedAt).getTime();
    const tb = new Date(b.record?.createdAt || b.indexedAt).getTime();
    return tb - ta;
  });

  const data: BlueskySearchResult = {
    posts: allPosts.slice(0, limit),
    hitsTotal: totalHits,
  };

  if (allPosts.length > 0) {
    setCache(cacheKey, data, 'social');
  }

  return data;
}

/** Health check */
export async function checkHealth(): Promise<boolean> {
  try {
    const res = await agent.app.bsky.feed.searchPosts({ q: 'test', limit: 1 });
    return res.data.posts.length >= 0;
  } catch {
    return false;
  }
}
