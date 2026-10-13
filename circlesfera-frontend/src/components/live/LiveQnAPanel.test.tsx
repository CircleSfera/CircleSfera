import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../test/test-utils';
import LiveQnAPanel from './LiveQnAPanel';

describe('LiveQnAPanel', () => {
  it('renders nothing when closed', () => {
    const { container } = renderWithProviders(
      <LiveQnAPanel
        isOpen={false}
        onClose={vi.fn()}
        isHost={false}
        questions={[]}
      />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it('uses catalog copy for the empty viewer state', () => {
    const { i18n } = renderWithProviders(
      <LiveQnAPanel
        isOpen
        onClose={vi.fn()}
        isHost={false}
        questions={[]}
        onAskQuestion={vi.fn()}
      />,
    );

    expect(i18n!.t('live.qna.title')).toBe('Questions');
    expect(
      screen.getByRole('heading', { name: i18n!.t('live.qna.title') }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(i18n!.t('live.qna.empty_viewer')),
    ).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText(i18n!.t('live.qna.placeholder')),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: i18n!.t('live.qna.send') }),
    ).toBeInTheDocument();
  });

  it('uses catalog copy for the empty host state', () => {
    const { i18n } = renderWithProviders(
      <LiveQnAPanel
        isOpen
        onClose={vi.fn()}
        isHost
        questions={[]}
        onClearHighlight={vi.fn()}
      />,
    );

    expect(
      screen.getByText(i18n!.t('live.qna.empty_host')),
    ).toBeInTheDocument();
    // Nothing to take off the video while no question is on it.
    expect(
      screen.queryByRole('button', { name: i18n!.t('live.qna.clear_screen') }),
    ).not.toBeInTheDocument();
  });

  it('offers to take the question off the video only while one is on it', () => {
    const onClear = vi.fn();
    const { i18n } = renderWithProviders(
      <LiveQnAPanel
        isOpen
        onClose={vi.fn()}
        isHost
        hasHighlight
        questions={[]}
        onClearHighlight={onClear}
      />,
    );

    fireEvent.click(
      screen.getByRole('button', { name: i18n!.t('live.qna.clear_screen') }),
    );
    expect(onClear).toHaveBeenCalled();
  });

  it('labels project from the catalog when the host has questions', () => {
    const onHighlight = vi.fn();
    const { i18n } = renderWithProviders(
      <LiveQnAPanel
        isOpen
        onClose={vi.fn()}
        isHost
        questions={[
          {
            id: 'q1',
            question: 'Favorite song?',
            username: 'alice',
          },
        ]}
        onHighlightQuestion={onHighlight}
      />,
    );

    fireEvent.click(
      screen.getByRole('button', { name: i18n!.t('live.qna.project') }),
    );
    expect(onHighlight).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'q1' }),
    );
  });
});
