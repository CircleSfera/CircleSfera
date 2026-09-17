/**
 * Authoritative registry of derived data stores in CircleSfera (DATA-001).
 *
 * A derived store holds cached, indexed, or projected state whose canonical
 * source of truth resides elsewhere (typically PostgreSQL primary tables).
 *
 * Every derived store MUST declare:
 *   1. Owner (service/module responsible for lifecycle)
 *   2. Storage medium and key pattern
 *   3. Canonical source of truth
 *   4. Deletion trigger and disposal method (ensuring deleted state does not persist)
 *   5. Rebuild source and reconstruction method
 *   6. Maximum retention window before state is considered stale/evicted
 */

export interface DerivedStoreDefinition {
  /** Human-readable name of the derived store. */
  name: string;
  /** Primary service or module that owns this derived store. */
  owner: string;
  /** Storage technology and key/table pattern. */
  storageMedium: string;
  /** Canonical source of truth (e.g. database table(s)). */
  canonicalSource: string;
  /** Event, job, or condition that triggers deletion of the derived state. */
  deletionTrigger: string;
  /** Specific operation used to delete or evict the derived state. */
  deletionMethod: string;
  /** Canonical data source from which the state can be fully reconstructed. */
  rebuildSource: string;
  /** Method, processor, or procedure used to rebuild the derived store. */
  rebuildMethod: string;
  /** Maximum duration stale or unrefreshed data can persist. */
  maxRetentionWindow: string;
  /** Whether the store can be reconstructed automatically from canonical data. */
  isRebuildable: boolean;
}

export const DERIVED_STORES = {
  /**
   * Fast-path chronological user feed inbox.
   * Stores recent published post IDs from followed accounts in chronological order.
   */
  REDIS_FEED_INBOX: {
    name: 'Redis Feed Inbox',
    owner: 'FeedInboxService',
    storageMedium: 'Redis Sorted Set (user:{profileId}:inbox)',
    canonicalSource: 'posts (PUBLISHED) + follows (ACCEPTED)',
    deletionTrigger:
      'USER_HARD_DELETED_EVENT or post deletion or profile delete',
    deletionMethod:
      'FeedInboxService.invalidateUserFeedCache (DEL) & removePostsFromInbox (ZREM)',
    rebuildSource:
      'posts where profileId IN (followingIds) ORDER BY createdAt DESC LIMIT 1000',
    rebuildMethod: 'FeedInboxService.rebuildInbox(profileId)',
    maxRetentionWindow: 'Capacity capped at 1000 items; evicted on user delete',
    isRebuildable: true,
  },

  /**
   * Feed algorithm recommendations cache (hybrid and trending).
   */
  FEED_ALGORITHM_CACHE: {
    name: 'Feed Recommendation Cache',
    owner: 'FeedService',
    storageMedium: 'CacheManager / Redis (feed:hybrid:*, feed:trending:*)',
    canonicalSource: 'posts + social graph + engagement metrics',
    deletionTrigger: 'Cache TTL expiration or profile deletion',
    deletionMethod: 'CacheManager TTL eviction or explicit del',
    rebuildSource: 'Full hybrid algorithm calculation query',
    rebuildMethod: 'FeedService.getHybridFeed / getTrendingFeed on-demand',
    maxRetentionWindow: '10 minutes TTL',
    isRebuildable: true,
  },

  /**
   * AI semantic embeddings for published posts.
   */
  PGVECTOR_POST_EMBEDDINGS: {
    name: 'Post Semantic Embeddings',
    owner: 'AIService / AIProcessor',
    storageMedium: 'post_embeddings (PostgreSQL pgvector vector(1536))',
    canonicalSource: 'posts (caption, text content)',
    deletionTrigger: 'Post hard deletion in database',
    deletionMethod: 'onDelete: Cascade foreign key',
    rebuildSource: 'posts.caption',
    rebuildMethod:
      'AIProcessor (generate-embedding job) via AIService.generateEmbedding',
    maxRetentionWindow: 'Lifespan of the owning Post row',
    isRebuildable: true,
  },

  /**
   * AI semantic embeddings for user profiles.
   */
  PGVECTOR_PROFILE_EMBEDDINGS: {
    name: 'Profile Semantic Embeddings',
    owner: 'AIService / AIProcessor',
    storageMedium: 'profile_embeddings (PostgreSQL pgvector vector(1536))',
    canonicalSource: 'profiles (bio, display name, niche categories)',
    deletionTrigger: 'Profile hard deletion in database',
    deletionMethod: 'onDelete: Cascade foreign key',
    rebuildSource: 'profiles.bio',
    rebuildMethod:
      'AIProcessor (generate-profile-embedding job) via AIService.generateEmbedding',
    maxRetentionWindow: 'Lifespan of the owning Profile row',
    isRebuildable: true,
  },

  /**
   * User search query history.
   */
  SEARCH_HISTORY: {
    name: 'User Search History',
    owner: 'SearchService / AccountDeletionProcessor',
    storageMedium: 'search_history (PostgreSQL)',
    canonicalSource: 'User-submitted search queries',
    deletionTrigger:
      '90-day GDPR retention TTL or Profile deletion or manual clear',
    deletionMethod:
      'AccountDeletionProcessor.cleanExpiredSearchHistory / onDelete: Cascade / SearchService.clearHistory',
    rebuildSource: 'Non-reconstructible (ephemeral user interaction log)',
    rebuildMethod: 'N/A (audit log, not derived projection)',
    maxRetentionWindow: '90 days (expiresAt)',
    isRebuildable: false,
  },

  /**
   * Cached combined, keyword, and semantic search query results.
   */
  SEARCH_QUERY_CACHE: {
    name: 'Search Query Cache',
    owner: 'SearchService',
    storageMedium:
      'CacheManager / Redis (search:combined:*, search:semantic:*)',
    canonicalSource:
      'profiles + posts + hashtags + post_embeddings + profile_embeddings',
    deletionTrigger: 'Cache TTL expiration or entity deletion',
    deletionMethod: 'CacheManager TTL eviction (300s - 600s)',
    rebuildSource:
      'Keyword SQL match + pgvector cosine similarity (<=> operator)',
    rebuildMethod: 'SearchService.search on-demand execution',
    maxRetentionWindow: '5 to 10 minutes TTL',
    isRebuildable: true,
  },

  /**
   * WebSocket active connection presence and room memberships.
   */
  SOCKET_PRESENCE: {
    name: 'Socket Realtime Presence',
    owner: 'SocketAuthService / RedisIoAdapter',
    storageMedium: 'Redis Socket.io Adapter (socket.io rooms & adapter keys)',
    canonicalSource: 'Active client TCP/TLS WebSocket connections',
    deletionTrigger: 'Socket client disconnection or heartbeat ping timeout',
    deletionMethod: 'Socket.io disconnect handler / automatic room departure',
    rebuildSource: 'Client reconnection with valid JWT token',
    rebuildMethod: 'Automatic client reconnect & handshake re-authentication',
    maxRetentionWindow: 'Heartbeat timeout (45s ping timeout)',
    isRebuildable: true,
  },
} as const satisfies Record<string, DerivedStoreDefinition>;

/**
 * Helper returning all rebuildable derived stores.
 */
export function getRebuildableDerivedStores(): DerivedStoreDefinition[] {
  return Object.values(DERIVED_STORES).filter((s) => s.isRebuildable);
}
