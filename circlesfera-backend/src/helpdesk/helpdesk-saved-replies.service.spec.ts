import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HelpdeskStore } from './helpdesk.store.js';
import { HelpdeskSavedRepliesService } from './helpdesk-saved-replies.service.js';
import { InMemoryHelpdeskDb } from './testing/in-memory-helpdesk-db.js';

// Saved replies, on rows in memory behind the real store: who sees which,
// who may change which, and that two organizations never meet.
describe('Help Desk: saved replies', () => {
  let db: InMemoryHelpdeskDb;
  let organization: string;
  let replies: HelpdeskSavedRepliesService;

  const agent = { ref: 'agent-1', canManage: false };
  const other = { ref: 'agent-2', canManage: false };
  const lead = { ref: 'lead-1', canManage: true };
  const words = {
    title: 'Refund',
    body: 'Hello {{name}}, your refund is on its way.',
  };

  beforeEach(() => {
    vi.resetAllMocks();
    db = new InMemoryHelpdeskDb();
    organization = 'org-a';
    replies = new HelpdeskSavedRepliesService(
      new HelpdeskStore(db as never, { current: () => organization }),
    );
  });

  it('keeps a personal reply for the agent who wrote it, with its placeholders as written', async () => {
    const created = await replies.create(agent, {
      title: '  Refund  ',
      body: `  ${words.body}  `,
    });

    expect(created).toMatchObject({ ...words, shared: false });
    expect(db.savedReplies[0]).toMatchObject({
      organizationId: 'org-a',
      ownerRef: 'agent-1',
    });
    expect(await replies.list('agent-1')).toHaveLength(1);
  });

  it('shows an agent the shared replies and their own, by title, and nobody else’s', async () => {
    await replies.create(agent, { title: 'Mine', body: 'a' });
    await replies.create(other, { title: 'Theirs', body: 'b' });
    await replies.create(lead, { title: 'For all', body: 'c', shared: true });
    await replies.create(lead, { title: 'Lead only', body: 'd' });

    expect(
      (await replies.list('agent-1')).map((r) => [r.title, r.shared]),
    ).toEqual([
      ['For all', true],
      ['Mine', false],
    ]);
    // Leading the team does not open the personal replies of others.
    expect((await replies.list('lead-1')).map((r) => r.title)).toEqual([
      'For all',
      'Lead only',
    ]);
  });

  it('lets only who leads the team share a reply', async () => {
    await expect(
      replies.create(agent, { ...words, shared: true }),
    ).rejects.toMatchObject({ status: 403 });
    expect(db.savedReplies).toHaveLength(0);

    expect(
      await replies.create(lead, { ...words, shared: true }),
    ).toMatchObject({
      shared: true,
    });
    expect(db.savedReplies[0].ownerRef).toBeNull();
  });

  it('refuses a reply that is only spaces', async () => {
    await expect(
      replies.create(agent, { title: '   ', body: 'x' }),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      replies.create(agent, { title: 'x', body: '   ' }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it('lets an agent change and delete their own reply', async () => {
    const mine = await replies.create(agent, words);

    expect(
      await replies.update(agent, mine.id, { title: ' Refunds ' }),
    ).toMatchObject({ title: 'Refunds', body: words.body, shared: false });
    expect(
      await replies.update(agent, mine.id, { body: 'New text' }),
    ).toMatchObject({
      title: 'Refunds',
      body: 'New text',
    });
    await expect(
      replies.update(agent, mine.id, { title: '  ' }),
    ).rejects.toMatchObject({ status: 400 });
    // Whose it is never changes.
    expect(db.savedReplies[0].ownerRef).toBe('agent-1');

    expect(await replies.remove(agent, mine.id)).toEqual({ deleted: true });
    expect(db.savedReplies).toHaveLength(0);
  });

  it('treats the personal reply of another agent as one that does not exist, for the lead too', async () => {
    const theirs = await replies.create(other, words);

    for (const actor of [agent, lead]) {
      await expect(
        replies.update(actor, theirs.id, { title: 'Taken' }),
      ).rejects.toMatchObject({ status: 404 });
      await expect(replies.remove(actor, theirs.id)).rejects.toMatchObject({
        status: 404,
      });
    }
    expect(db.savedReplies[0]).toMatchObject({ title: 'Refund' });
  });

  it('lets an agent use a shared reply but not change or delete it; the lead can', async () => {
    const shared = await replies.create(lead, { ...words, shared: true });

    await expect(
      replies.update(agent, shared.id, { title: 'Mine now' }),
    ).rejects.toMatchObject({ status: 403 });
    await expect(replies.remove(agent, shared.id)).rejects.toMatchObject({
      status: 403,
    });

    expect(
      await replies.update(lead, shared.id, { title: 'Refunds' }),
    ).toMatchObject({ title: 'Refunds', shared: true });
    await replies.remove(lead, shared.id);
    expect(db.savedReplies).toHaveLength(0);
  });

  it('says so when the reply does not exist, or went away in between', async () => {
    await expect(
      replies.update(agent, 'missing', { title: 'x' }),
    ).rejects.toMatchObject({ status: 404 });

    const mine = await replies.create(agent, words);
    const store = (replies as unknown as { store: HelpdeskStore }).store;
    vi.spyOn(store, 'updateSavedReply').mockResolvedValue(null);
    await expect(
      replies.update(agent, mine.id, { title: 'x' }),
    ).rejects.toMatchObject({ status: 404 });
  });

  describe('a second organization', () => {
    it('sees and changes nothing of the first, not even its shared replies', async () => {
      const shared = await replies.create(lead, { ...words, shared: true });
      const mine = await replies.create(agent, words);
      const before = JSON.stringify(db.savedReplies);

      organization = 'org-b';
      // The same people, signed in to the other organization.
      expect(await replies.list('agent-1')).toEqual([]);
      expect(await replies.list('lead-1')).toEqual([]);
      for (const id of [shared.id, mine.id]) {
        for (const actor of [agent, lead]) {
          await expect(
            replies.update(actor, id, { title: 'x' }),
          ).rejects.toMatchObject({ status: 404 });
          await expect(replies.remove(actor, id)).rejects.toMatchObject({
            status: 404,
          });
        }
      }
      const store = new HelpdeskStore(db as never, { current: () => 'org-b' });
      expect(
        await store.updateSavedReply(shared.id, { title: 'x' }),
      ).toBeNull();
      expect(await store.deleteSavedReply(shared.id)).toBe(false);
      expect(JSON.stringify(db.savedReplies)).toBe(before);

      await replies.create(lead, { title: 'Of B', body: 'b', shared: true });
      organization = 'org-a';
      expect((await replies.list('agent-1')).map((r) => r.title)).toEqual([
        'Refund',
        'Refund',
      ]);
    });
  });
});
