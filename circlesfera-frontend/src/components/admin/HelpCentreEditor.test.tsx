import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { adminApi } from '../../services/admin.service';
import { renderWithProviders } from '../../test/test-utils';
import { HelpCentreEditor } from './HelpCentreEditor';

vi.mock('../../services/admin.service', () => ({
  adminApi: {
    getArticles: vi.fn(),
    getArticle: vi.fn(),
    createArticle: vi.fn(),
    updateArticle: vi.fn(),
    publishArticle: vi.fn(),
    takeBackArticle: vi.fn(),
    deleteArticle: vi.fn(),
  },
}));

const article = (overrides: Record<string, unknown> = {}) => ({
  id: 'a-1',
  slug: 'how-refunds-work',
  topic: 'PAYMENTS',
  status: 'DRAFT',
  position: 1,
  usefulYes: 7,
  usefulNo: 2,
  updatedAt: '2026-09-01T10:00:00.000Z',
  locales: ['es', 'en'],
  texts: [
    { locale: 'es', title: 'Reembolsos', body: 'Texto en español.' },
    { locale: 'en', title: 'Refunds', body: '## How\n- one\n- two' },
  ],
  ...overrides,
});
const summary = (overrides: Record<string, unknown> = {}) => ({
  id: 'a-1',
  slug: 'how-refunds-work',
  topic: 'PAYMENTS',
  status: 'DRAFT',
  position: 1,
  usefulYes: 7,
  usefulNo: 2,
  updatedAt: '2026-09-01T10:00:00.000Z',
  titles: { es: 'Reembolsos', en: 'Refunds' },
  missing: [],
  ...overrides,
});

describe('HelpCentreEditor', () => {
  const onToast = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(adminApi.getArticles).mockResolvedValue({
      data: [
        summary(),
        summary({
          id: 'a-2',
          slug: 'draft',
          titles: { es: 'Solo en español' },
          missing: ['en'],
        }),
      ],
    } as never);
    vi.mocked(adminApi.getArticle).mockResolvedValue({
      data: article(),
    } as never);
    for (const call of [
      'createArticle',
      'updateArticle',
      'publishArticle',
      'takeBackArticle',
    ] as const) {
      vi.mocked(adminApi[call]).mockResolvedValue({ data: article() } as never);
    }
    vi.mocked(adminApi.deleteArticle).mockResolvedValue({
      data: { deleted: true },
    } as never);
  });

  const openPanel = async () => {
    const { i18n } = renderWithProviders(
      <HelpCentreEditor onToast={onToast} />,
    );
    const t = (key: string, values?: Record<string, unknown>) =>
      i18n!.t(`admin.support.help_centre.${key}`, values);
    fireEvent.click(screen.getByRole('button', { name: t('open') }));
    return { t, panel: within(await screen.findByRole('dialog')) };
  };
  const edit = async () => {
    const opened = await openPanel();
    fireEvent.click(
      await opened.panel.findByRole('button', {
        name: opened.t('edit_named', { title: 'Reembolsos' }),
      }),
    );
    await opened.panel.findByDisplayValue('Reembolsos');
    return opened;
  };

  it('asks for nothing until it is opened', () => {
    renderWithProviders(<HelpCentreEditor onToast={onToast} />);

    expect(adminApi.getArticles).not.toHaveBeenCalled();
  });

  it('lists drafts and published with their counts and what they lack', async () => {
    const { t, panel } = await openPanel();

    expect(await panel.findByText('Reembolsos')).toBeInTheDocument();
    expect(panel.getByText(/\/help\/how-refunds-work/)).toHaveTextContent(
      t('useful_counts', { yes: 7, no: 2 }),
    );
    expect(
      panel.getByText(t('missing', { languages: t('language.en') })),
    ).toBeInTheDocument();
  });

  it('writes a new article: the address follows the first title until it is typed by hand', async () => {
    const { t, panel } = await openPanel();
    fireEvent.click(await panel.findByRole('button', { name: t('new') }));
    const save = panel.getByRole('button', { name: t('save') });
    expect(save).toBeDisabled();

    fireEvent.change(panel.getByLabelText(t('field_title')), {
      target: { value: '¿Cómo pido un reembolso?' },
    });
    expect(panel.getByLabelText(t('field_slug'))).toHaveValue(
      'como-pido-un-reembolso',
    );
    fireEvent.change(panel.getByLabelText(t('field_slug')), {
      target: { value: 'reembolsos' },
    });
    fireEvent.change(panel.getByLabelText(t('field_title')), {
      target: { value: 'Reembolsos' },
    });
    expect(panel.getByLabelText(t('field_slug'))).toHaveValue('reembolsos');
    fireEvent.change(panel.getByLabelText(t('field_body')), {
      target: { value: '  Escribe a soporte.  ' },
    });
    fireEvent.click(save);

    await waitFor(() =>
      expect(adminApi.createArticle).toHaveBeenCalledWith({
        slug: 'reembolsos',
        topic: 'OTHER',
        position: 0,
        texts: [
          { locale: 'en', title: '', body: '' },
          { locale: 'es', title: 'Reembolsos', body: 'Escribe a soporte.' },
        ],
      }),
    );
    await waitFor(() =>
      expect(onToast).toHaveBeenCalledWith(t('toast_saved'), 'success'),
    );
  });

  it('edits each language on its own tab, keeps the address fixed, and saves both', async () => {
    const { t, panel } = await edit();

    expect(panel.getByLabelText(t('field_slug'))).toBeDisabled();
    fireEvent.click(panel.getByRole('button', { name: t('language.en') }));
    expect(panel.getByLabelText(t('field_title'))).toHaveValue('Refunds');
    fireEvent.change(panel.getByLabelText(t('field_title')), {
      target: { value: 'How refunds work' },
    });
    fireEvent.click(panel.getByRole('button', { name: t('save') }));

    await waitFor(() =>
      expect(adminApi.updateArticle).toHaveBeenCalledWith('a-1', {
        topic: 'PAYMENTS',
        position: 1,
        texts: [
          {
            locale: 'en',
            title: 'How refunds work',
            body: '## How\n- one\n- two',
          },
          { locale: 'es', title: 'Reembolsos', body: 'Texto en español.' },
        ],
      }),
    );
  });

  it('shows the article as the public will see it', async () => {
    const { t, panel } = await edit();
    fireEvent.click(panel.getByRole('button', { name: t('language.en') }));

    fireEvent.click(panel.getByRole('button', { name: t('preview') }));

    const preview = within(panel.getByRole('region', { name: t('preview') }));
    expect(
      preview.getByRole('heading', { name: 'Refunds' }),
    ).toBeInTheDocument();
    expect(preview.getByRole('heading', { name: 'How' })).toBeInTheDocument();
    expect(
      preview.getAllByRole('listitem').map((li) => li.textContent),
    ).toEqual(['one', 'two']);
  });

  it('publishes a draft and takes a published article back', async () => {
    const { t, panel } = await edit();
    vi.mocked(adminApi.publishArticle).mockResolvedValue({
      data: article({ status: 'PUBLISHED' }),
    } as never);

    fireEvent.click(panel.getByRole('button', { name: t('publish') }));

    await waitFor(() =>
      expect(adminApi.publishArticle).toHaveBeenCalledWith('a-1'),
    );
    fireEvent.click(await panel.findByRole('button', { name: t('take_back') }));
    await waitFor(() =>
      expect(adminApi.takeBackArticle).toHaveBeenCalledWith('a-1'),
    );
    // A published article has no delete.
    expect(onToast).toHaveBeenCalledWith(t('toast_published'), 'success');
  });

  it('says which language is missing when it cannot be published', async () => {
    vi.mocked(adminApi.publishArticle).mockRejectedValue({
      response: {
        data: {
          errorCode: 'ARTICLE_LANGUAGE_MISSING',
          details: { missing: ['en'] },
        },
      },
    });
    const { t, panel } = await edit();

    fireEvent.click(panel.getByRole('button', { name: t('publish') }));

    await waitFor(() =>
      expect(onToast).toHaveBeenCalledWith(
        t('toast_language_missing', { languages: t('language.en') }),
        'error',
      ),
    );
  });

  it('deletes a draft after asking once more, and offers no delete on a published article', async () => {
    const { t, panel } = await edit();

    fireEvent.click(panel.getByRole('button', { name: t('delete') }));
    expect(adminApi.deleteArticle).not.toHaveBeenCalled();
    fireEvent.click(panel.getByRole('button', { name: t('delete_confirm') }));
    await waitFor(() =>
      expect(adminApi.deleteArticle).toHaveBeenCalledWith('a-1'),
    );
    await waitFor(() =>
      expect(onToast).toHaveBeenCalledWith(t('toast_deleted'), 'success'),
    );

    vi.mocked(adminApi.getArticle).mockResolvedValue({
      data: article({ status: 'PUBLISHED' }),
    } as never);
    fireEvent.click(
      await panel.findByRole('button', {
        name: t('edit_named', { title: 'Reembolsos' }),
      }),
    );
    await panel.findByDisplayValue('Reembolsos');
    expect(panel.queryByRole('button', { name: t('delete') })).toBeNull();
    expect(panel.getByText(t('published_hint'))).toBeInTheDocument();
  });

  it('says so when something fails, and keeps what was written', async () => {
    vi.mocked(adminApi.updateArticle).mockRejectedValue(new Error('down'));
    const { t, panel } = await edit();
    fireEvent.change(panel.getByLabelText(t('field_title')), {
      target: { value: 'Otro título' },
    });

    fireEvent.click(panel.getByRole('button', { name: t('save') }));

    await waitFor(() =>
      expect(onToast).toHaveBeenCalledWith(expect.any(String), 'error'),
    );
    expect(panel.getByLabelText(t('field_title'))).toHaveValue('Otro título');
  });
});
