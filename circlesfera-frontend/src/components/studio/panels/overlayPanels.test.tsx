import { act, fireEvent, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { useStudioStore } from '../../../stores/studioStore';
import {
  mediaClip,
  openStudioProject,
  studioClip,
  studioTrack,
} from '../../../test/studio-fixtures';
import { renderWithProviders } from '../../../test/test-utils';
import {
  BLUE_SCREEN,
  DEFAULT_CHROMA_SOFTNESS,
  DEFAULT_CHROMA_STRENGTH,
  GREEN_SCREEN,
} from '../../../utils/studioOverlay';
import BlendPanel from './BlendPanel';
import ChromaPanel from './ChromaPanel';

const store = () => useStudioStore.getState();
const open = (selectedClipId: string) =>
  openStudioProject(
    [
      studioTrack('v1', 'video', [mediaClip('main', { startAt: 0 })]),
      studioTrack('v2', 'video', [mediaClip('over', { trackId: 'v2' })]),
    ],
    { selectedClipId },
  );

describe('the blend of a layer', () => {
  beforeEach(() => open('over'));

  it('sets its mode and its shape, each in a step of undo', () => {
    renderWithProviders(<BlendPanel />);
    expect(screen.getByRole('button', { name: 'Normal' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Screen' }));
    fireEvent.click(screen.getByRole('button', { name: 'Heart' }));
    expect(studioClip('over')).toMatchObject({
      blend: 'screen',
      shape: 'heart',
    });
    expect(store().past).toHaveLength(2);
    expect(screen.getByRole('button', { name: 'Heart' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('is not offered for a clip of the main track', () => {
    open('main');
    const view = renderWithProviders(<BlendPanel />);
    expect(view.container).toBeEmptyDOMElement();
  });
});

describe('the green screen of a layer', () => {
  beforeEach(() => open('over'));

  it('takes green or blue out, with its strength and softness, and turns off', () => {
    renderWithProviders(<ChromaPanel />);
    expect(screen.getByRole('button', { name: 'Off' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.queryByRole('slider')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Green' }));
    expect(studioClip('over').chroma).toEqual({
      color: GREEN_SCREEN,
      strength: DEFAULT_CHROMA_STRENGTH,
      softness: DEFAULT_CHROMA_SOFTNESS,
    });
    fireEvent.change(screen.getByRole('slider', { name: /Strength/ }), {
      target: { value: '70' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Blue' }));
    expect(studioClip('over').chroma).toMatchObject({
      color: BLUE_SCREEN,
      strength: 70,
    });
    fireEvent.click(screen.getByRole('button', { name: 'Off' }));
    expect(studioClip('over').chroma).toBeUndefined();
  });

  it('picks a colour from the video, showing it once picked', () => {
    renderWithProviders(<ChromaPanel />);
    fireEvent.click(screen.getByRole('button', { name: 'Pick colour' }));
    expect(store().pickingColor).toBe(true);
    expect(screen.getByText(/Tap the colour to remove/)).toBeInTheDocument();
    act(() => {
      store().setPickingColor(false);
      store().updateClip('over', {
        chroma: { color: '#123456', strength: 40, softness: 20 },
      } as never);
    });
    const pick = screen.getByRole('button', { name: 'Pick colour' });
    expect(pick.querySelector('span[style]')).toHaveStyle({
      backgroundColor: '#123456',
    });
  });

  it('stops picking when another panel opens or another clip is chosen', () => {
    act(() => store().setOpenSheet('chroma'));
    act(() => store().setPickingColor(true));
    act(() => store().setOpenSheet('blend'));
    expect(store().pickingColor).toBe(false);
    act(() => store().setPickingColor(true));
    act(() => store().selectClip('main'));
    expect(store().pickingColor).toBe(false);
  });

  it('is not offered for a clip of the main track', () => {
    open('main');
    const view = renderWithProviders(<ChromaPanel />);
    expect(view.container).toBeEmptyDOMElement();
  });
});
