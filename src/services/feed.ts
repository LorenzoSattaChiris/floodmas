import { getFloodWarnings } from './ea-api.js';
import { searchFloodPosts, type BlueskyPost } from './bluesky.js';
import { getCached, setCache } from './cache.js';

export interface FeedItem {
  id: string;
  source: 'ea' | 'bluesky';
  text: string;
  timestamp: string;
  // EA warning fields
  severity?: string;
  severityLevel?: number;
  area?: string;
  county?: string;
  river?: string;
  isTidal?: boolean;
  // Bluesky fields
  author?: {
    handle: string;
    displayName?: string;
    avatar?: string;
  };
  likes?: number;
  reposts?: number;
  replies?: number;
  url?: string;
}

export interface FeedResponse {
  items: FeedItem[];
  sources: { ea: number; bluesky: number };
  generatedAt: string;
}

interface EAWarning {
  '@id'?: string;
  description?: string;
  eaAreaName?: string;
  eaRegionName?: string;
  floodArea?: {
    county?: string;
    riverOrSea?: string;
  };
  floodAreaID?: string;
  isTidal?: boolean;
  message?: string;
  severity?: string;
  severityLevel?: number;
  timeMessageChanged?: string;
  timeRaised?: string;
  timeSeverityChanged?: string;
}

function warningToFeedItem(w: EAWarning): FeedItem {
  return {
    id: w['@id'] || w.floodAreaID || '',
    source: 'ea',
    text: w.message || w.description || '',
    timestamp: w.timeMessageChanged || w.timeRaised || w.timeSeverityChanged || '',
    severity: w.severity,
    severityLevel: w.severityLevel,
    area: w.description || w.eaAreaName,
    county: w.floodArea?.county,
    river: w.floodArea?.riverOrSea,
    isTidal: w.isTidal,
  };
}

function bskyToFeedItem(post: BlueskyPost): FeedItem {
  const handle = post.author?.handle || '';
  const uriParts = post.uri.split('/');
  const postId = uriParts[uriParts.length - 1];
  return {
    id: post.uri,
    source: 'bluesky',
    text: post.record?.text || '',
    timestamp: post.record?.createdAt || post.indexedAt,
    author: {
      handle,
      displayName: post.author?.displayName,
      avatar: post.author?.avatar,
    },
    likes: post.likeCount ?? 0,
    reposts: post.repostCount ?? 0,
    replies: post.replyCount ?? 0,
    url: `https://bsky.app/profile/${encodeURIComponent(handle)}/post/${encodeURIComponent(postId)}`,
  };
}

/** Unified flood feed combining EA warnings + Bluesky posts */
export async function getFloodFeed(
  limit = 25,
  mode: 'focused' | 'broad' = 'focused',
): Promise<FeedResponse> {
  const cacheKey = `feed:${mode}:${limit}`;
  const cached = getCached<FeedResponse>(cacheKey);
  if (cached) return cached.data;

  const items: FeedItem[] = [];
  let eaCount = 0;
  let bskyCount = 0;

  // Always fetch EA warnings (reliable, always available)
  try {
    const warnings = await getFloodWarnings();
    const warningItems: FeedItem[] = (warnings?.items || []).map(
      (w: EAWarning) => warningToFeedItem(w),
    );
    items.push(...warningItems);
    eaCount = warningItems.length;
  } catch (e) {
    console.warn('Feed: EA warnings fetch failed:', e);
  }

  // Always fetch Bluesky social posts
  try {
    const bskyLimit = mode === 'broad' ? 30 : 15;
    const bluesky = await searchFloodPosts(bskyLimit, mode);
    const bskyItems = (bluesky?.posts || []).map(bskyToFeedItem);
    items.push(...bskyItems);
    bskyCount = bskyItems.length;
  } catch {
    // Bluesky unavailable — EA still provides data
  }

  // Sort all items newest first
  items.sort((a, b) => {
    const ta = new Date(a.timestamp || 0).getTime();
    const tb = new Date(b.timestamp || 0).getTime();
    return tb - ta;
  });

  const response: FeedResponse = {
    items: items.slice(0, limit),
    sources: { ea: eaCount, bluesky: bskyCount },
    generatedAt: new Date().toISOString(),
  };

  if (items.length > 0) {
    setCache(cacheKey, response, 'social');
  }

  return response;
}
