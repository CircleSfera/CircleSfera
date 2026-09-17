import { describe, expect, it } from 'vitest';
import {
  DERIVED_STORES,
  getRebuildableDerivedStores,
} from './derived-stores.constants.js';

describe('DERIVED_STORES Registry (DATA-001)', () => {
  it('defines all required derived stores in the platform', () => {
    const expectedStores = [
      'REDIS_FEED_INBOX',
      'FEED_ALGORITHM_CACHE',
      'PGVECTOR_POST_EMBEDDINGS',
      'PGVECTOR_PROFILE_EMBEDDINGS',
      'SEARCH_HISTORY',
      'SEARCH_QUERY_CACHE',
      'SOCKET_PRESENCE',
    ];

    for (const storeKey of expectedStores) {
      expect(DERIVED_STORES).toHaveProperty(storeKey);
    }
  });

  it('every store declares required lifecycle fields', () => {
    for (const [key, store] of Object.entries(DERIVED_STORES)) {
      expect(store.name, `${key}.name`).toBeTruthy();
      expect(store.owner, `${key}.owner`).toBeTruthy();
      expect(store.storageMedium, `${key}.storageMedium`).toBeTruthy();
      expect(store.canonicalSource, `${key}.canonicalSource`).toBeTruthy();
      expect(store.deletionTrigger, `${key}.deletionTrigger`).toBeTruthy();
      expect(store.deletionMethod, `${key}.deletionMethod`).toBeTruthy();
      expect(store.rebuildSource, `${key}.rebuildSource`).toBeTruthy();
      expect(store.rebuildMethod, `${key}.rebuildMethod`).toBeTruthy();
      expect(
        store.maxRetentionWindow,
        `${key}.maxRetentionWindow`,
      ).toBeTruthy();
      expect(typeof store.isRebuildable, `${key}.isRebuildable`).toBe(
        'boolean',
      );
    }
  });

  it('declares Redis Feed Inbox with correct ownership, deletion, and rebuild source', () => {
    const inbox = DERIVED_STORES.REDIS_FEED_INBOX;
    expect(inbox.owner).toBe('FeedInboxService');
    expect(inbox.deletionMethod).toContain('invalidateUserFeedCache');
    expect(inbox.rebuildMethod).toContain('rebuildInbox');
    expect(inbox.isRebuildable).toBe(true);
  });

  it('declares pgvector embeddings as cascade-deleted on source entity deletion', () => {
    const postEmbeddings = DERIVED_STORES.PGVECTOR_POST_EMBEDDINGS;
    expect(postEmbeddings.deletionMethod).toContain('Cascade');
    expect(postEmbeddings.isRebuildable).toBe(true);

    const profileEmbeddings = DERIVED_STORES.PGVECTOR_PROFILE_EMBEDDINGS;
    expect(profileEmbeddings.deletionMethod).toContain('Cascade');
    expect(profileEmbeddings.isRebuildable).toBe(true);
  });

  it('identifies rebuildable vs non-rebuildable stores accurately', () => {
    const rebuildables = getRebuildableDerivedStores();
    expect(rebuildables.length).toBeGreaterThan(0);

    const names = rebuildables.map((s) => s.name);
    expect(names).toContain('Redis Feed Inbox');
    expect(names).toContain('Feed Recommendation Cache');
    expect(names).toContain('Post Semantic Embeddings');
    expect(names).not.toContain('User Search History');
  });
});
