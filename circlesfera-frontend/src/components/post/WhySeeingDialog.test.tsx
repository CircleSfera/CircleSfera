import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { postsApi } from '../../services/posts.service';
import { renderWithProviders } from '../../test/test-utils';
import WhySeeingDialog from './WhySeeingDialog';

vi.mock('../../services/posts.service', () => ({
  postsApi: { getWhy: vi.fn() },
}));

const reply = (reasons: unknown[]) => ({ data: { reasons } }) as never;

describe('WhySeeingDialog', () => {
  beforeEach(() => vi.clearAllMocks());

  it('lists the reasons the server gives, in words, and how recommendations work', async () => {
    vi.mocked(postsApi.getWhy).mockResolvedValue(
      reply([
        { code: 'following', username: 'ana' },
        { code: 'liked_similar_tags', tags: ['cats', 'dogs'] },
        { code: 'similar_content' },
        { code: 'popular' },
        { code: 'new' },
      ]),
    );
    const { i18n } = renderWithProviders(
      <WhySeeingDialog postId="post-1" isOpen onClose={vi.fn()} />,
    );

    expect(await screen.findByText('You follow @ana.')).toBeInTheDocument();
    expect(
      screen.getByText(
        'It has #cats and #dogs, like posts you liked or saved.',
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(i18n!.t('post.why_seeing.similar_content')),
    ).toBeInTheDocument();
    expect(
      screen.getByText(i18n!.t('post.why_seeing.how')),
    ).toBeInTheDocument();
    expect(postsApi.getWhy).toHaveBeenCalledWith('post-1');
  });

  it('explains a promotion with who paid and where it is aimed', async () => {
    vi.mocked(postsApi.getWhy).mockResolvedValue(
      reply([{ code: 'promoted', username: 'shop', countries: ['ES'] }]),
    );
    renderWithProviders(
      <WhySeeingDialog postId="post-1" isOpen onClose={vi.fn()} />,
    );

    expect(await screen.findByText(/@shop .*Spain/)).toBeInTheDocument();
  });

  it('says so when there is no specific reason', async () => {
    vi.mocked(postsApi.getWhy).mockResolvedValue(reply([]));
    const { i18n } = renderWithProviders(
      <WhySeeingDialog postId="post-1" isOpen onClose={vi.fn()} />,
    );

    expect(
      await screen.findByText(i18n!.t('post.why_seeing.none')),
    ).toBeInTheDocument();
  });

  it('says when it cannot load, and tries again', async () => {
    vi.mocked(postsApi.getWhy)
      .mockRejectedValueOnce(new Error('down'))
      .mockResolvedValueOnce(reply([{ code: 'new' }]));
    const { i18n } = renderWithProviders(
      <WhySeeingDialog postId="post-1" isOpen onClose={vi.fn()} />,
    );

    fireEvent.click(
      await screen.findByRole('button', {
        name: i18n!.t('post.why_seeing.retry'),
      }),
    );
    await waitFor(() =>
      expect(
        screen.getByText(i18n!.t('post.why_seeing.new')),
      ).toBeInTheDocument(),
    );
  });

  it('asks nothing while closed', () => {
    renderWithProviders(
      <WhySeeingDialog postId="post-1" isOpen={false} onClose={vi.fn()} />,
    );
    expect(postsApi.getWhy).not.toHaveBeenCalled();
  });
});
