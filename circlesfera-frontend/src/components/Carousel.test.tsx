import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithProviders } from '../test/test-utils';
import Carousel from './Carousel';

const media = [
  {
    id: 'm1',
    url: 'https://cdn.example/a.jpg',
    type: 'image',
  },
  {
    id: 'm2',
    url: 'https://cdn.example/b.jpg',
    type: 'image',
  },
];

describe('Carousel', () => {
  it('labels the landmark and slide controls from the catalog', () => {
    const { i18n } = renderWithProviders(<Carousel media={media} />);

    expect(
      screen.getByRole('region', { name: i18n!.t('post.media.carousel') }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: i18n!.t('post.media.next_slide') }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(i18n!.t('post.media.position', { n: 1, total: 2 })),
    ).toBeInTheDocument();
  });

  it('uses Spanish slide labels', () => {
    const { i18n } = renderWithProviders(<Carousel media={media} />, {
      lng: 'es',
    });

    expect(i18n!.t('post.media.next_slide')).toBe('Foto o vídeo siguiente');
    expect(
      screen.getByRole('button', { name: i18n!.t('post.media.next_slide') }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Next slide' }),
    ).not.toBeInTheDocument();
  });

  function swipe(strip: Element, fromX: number, toX: number, toY = 0) {
    fireEvent.touchStart(strip, { touches: [{ clientX: fromX, clientY: 0 }] });
    fireEvent.touchMove(strip, { touches: [{ clientX: toX, clientY: toY }] });
    fireEvent.touchEnd(strip, {
      changedTouches: [{ clientX: toX, clientY: toY }],
    });
  }

  function strip() {
    const first = screen.getAllByRole('img', { hidden: true })[0];
    return first.closest('.touch-pan-y') as Element;
  }

  it('changes item on a swipe, and stays within the first and the last', () => {
    const { i18n } = renderWithProviders(<Carousel media={media} />);
    const at = (n: number) =>
      screen.queryByText(i18n!.t('post.media.position', { n, total: 2 }));

    swipe(strip(), 300, 100);
    expect(at(2)).toBeInTheDocument();

    // Already on the last one: a further swipe goes nowhere.
    swipe(strip(), 300, 100);
    expect(at(2)).toBeInTheDocument();

    swipe(strip(), 100, 300);
    expect(at(1)).toBeInTheDocument();
  });

  it('leaves a short or a vertical gesture alone', () => {
    const { i18n } = renderWithProviders(<Carousel media={media} />);
    const at = (n: number) =>
      screen.queryByText(i18n!.t('post.media.position', { n, total: 2 }));

    swipe(strip(), 300, 280);
    expect(at(1)).toBeInTheDocument();

    swipe(strip(), 300, 240, 400);
    expect(at(1)).toBeInTheDocument();
  });
});
