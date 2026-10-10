import { act, fireEvent, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { useStudioStore } from '../../../stores/studioStore';
import {
  mediaClip,
  openStudioProject,
  studioClip,
  studioTrack,
  textClip,
} from '../../../test/studio-fixtures';
import { renderWithProviders } from '../../../test/test-utils';
import type { TextClip } from '../../../types/studio';
import PropertiesPanel from './PropertiesPanel';

function open(selectedClipId: string | null) {
  openStudioProject(
    [
      studioTrack('v1', 'video', [
        mediaClip('clip'),
        mediaClip('photo', { type: 'image', startAt: 10 }),
      ]),
      studioTrack('a1', 'audio', [mediaClip('song', { type: 'audio' })]),
      studioTrack('t1', 'text', [textClip('words')]),
    ],
    { selectedClipId },
  );
  return renderWithProviders(<PropertiesPanel />);
}

const tab = (name: string) => screen.getByRole('button', { name });
const slide = (name: string, value: string) =>
  fireEvent.change(screen.getByRole('slider', { name }), { target: { value } });
const canUndo = () => useStudioStore.getState().canUndo;

describe('PropertiesPanel', () => {
  beforeEach(() => {
    useStudioStore.setState({ project: null, selectedClipId: null });
  });

  it('shows nothing when no clip is selected', () => {
    const { container } = open(null);
    expect(container).toBeEmptyDOMElement();
  });

  it.each([
    ['clip', 'Video'],
    ['photo', 'Image'],
    ['song', 'Audio'],
    ['words', 'Text'],
  ])('names the kind of the selected clip (%s)', (id, kind) => {
    open(id);
    expect(screen.getAllByText(kind)[0]).toBeInTheDocument();
  });

  it('lets go of the clip from the close button', () => {
    open('clip');
    fireEvent.click(screen.getByRole('button', { name: 'Close properties' }));
    expect(useStudioStore.getState().selectedClipId).toBeNull();
  });

  describe('the tabs each kind of clip has', () => {
    it('gives a video its position, its filters and its sound', () => {
      open('clip');
      expect(tab('Transform')).toBeInTheDocument();
      expect(tab('Filters')).toBeInTheDocument();
      expect(tab('Audio & speed')).toBeInTheDocument();
    });

    it('gives a text its position and its lettering, and no sound', () => {
      open('words');
      expect(tab('Text')).toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: 'Audio & speed' }),
      ).not.toBeInTheDocument();
    });

    it('gives a sound no look to change', () => {
      open('song');
      expect(tab('Audio & speed')).toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: 'Filters' }),
      ).not.toBeInTheDocument();
    });

    it('goes back to the first tab when the next clip lacks the open one', () => {
      open('clip');
      fireEvent.click(tab('Audio & speed'));
      expect(
        screen.getByRole('slider', { name: 'Volume' }),
      ).toBeInTheDocument();

      act(() => useStudioStore.setState({ selectedClipId: 'words' }));

      expect(screen.getByRole('slider', { name: 'Scale' })).toBeInTheDocument();
    });

    it('goes back to the first tab when a sound follows a clip with its filters open', () => {
      open('clip');
      fireEvent.click(tab('Filters'));
      expect(screen.getByText('Visual filters')).toBeInTheDocument();

      act(() => useStudioStore.setState({ selectedClipId: 'song' }));

      expect(screen.getByRole('slider', { name: 'Scale' })).toBeInTheDocument();
    });

    it('keeps the open tab when the next clip has it too', () => {
      open('clip');
      fireEvent.click(tab('Audio & speed'));

      act(() => useStudioStore.setState({ selectedClipId: 'song' }));

      expect(
        screen.getByRole('slider', { name: 'Volume' }),
      ).toBeInTheDocument();
    });
  });

  describe('position and size', () => {
    it('changes scale and rotation, showing the value', () => {
      open('clip');

      slide('Scale', '1.5');
      slide('Rotation', '45');

      expect(studioClip('clip').transform).toMatchObject({
        scale: 1.5,
        rotation: 45,
      });
      expect(screen.getByText('150%')).toBeInTheDocument();
      expect(screen.getByText('45°')).toBeInTheDocument();
    });

    it('moves the clip, taking an emptied field as zero', () => {
      open('clip');
      const x = screen.getByRole('spinbutton', { name: 'Position X' });
      const y = screen.getByRole('spinbutton', { name: 'Position Y' });

      fireEvent.change(x, { target: { value: '120' } });
      fireEvent.change(y, { target: { value: '-40' } });
      expect(studioClip('clip').transform).toMatchObject({ x: 120, y: -40 });

      fireEvent.change(x, { target: { value: '' } });
      expect(studioClip('clip').transform?.x).toBe(0);
    });

    it('makes one step to undo out of a whole slide of a control', () => {
      open('clip');
      const scale = screen.getByRole('slider', { name: 'Scale' });

      fireEvent.pointerDown(scale);
      fireEvent.change(scale, { target: { value: '1.2' } });
      fireEvent.change(scale, { target: { value: '1.4' } });
      expect(canUndo()).toBe(true);

      act(() => useStudioStore.getState().undo());
      expect(studioClip('clip').transform?.scale).toBe(1);
      expect(canUndo()).toBe(false);
    });

    it('opens a step to undo when a position field takes focus', () => {
      open('clip');
      const x = screen.getByRole('spinbutton', { name: 'Position X' });

      fireEvent.focus(x);
      fireEvent.change(x, { target: { value: '30' } });

      act(() => useStudioStore.getState().undo());
      expect(studioClip('clip').transform?.x).toBe(0);
    });

    it('starts from the resting position for a clip saved without one', () => {
      openStudioProject(
        [
          studioTrack('v1', 'video', [
            mediaClip('clip', { transform: undefined }),
          ]),
        ],
        { selectedClipId: 'clip' },
      );
      renderWithProviders(<PropertiesPanel />);

      slide('Rotation', '90');

      expect(studioClip('clip').transform).toEqual({
        scale: 1,
        rotation: 90,
        x: 0,
        y: 0,
      });
    });

    it('fades and flips a video, each flip being a step to undo', () => {
      open('clip');

      slide('Opacity', '0.4');
      expect(studioClip('clip').opacity).toBe(0.4);
      expect(screen.getByText('40%')).toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: 'Flip horizontal' }));
      fireEvent.click(screen.getByRole('button', { name: 'Flip vertical' }));
      expect(studioClip('clip')).toMatchObject({ flipX: true, flipY: true });

      fireEvent.click(screen.getByRole('button', { name: 'Flip horizontal' }));
      expect(studioClip('clip').flipX).toBe(false);
      expect(canUndo()).toBe(true);
    });

    it('offers neither opacity nor flip for a text', () => {
      open('words');
      expect(
        screen.queryByRole('slider', { name: 'Opacity' }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: 'Flip horizontal' }),
      ).not.toBeInTheDocument();
    });
  });

  describe('the lettering of a text', () => {
    const words = () => studioClip<TextClip>('words');
    const openText = () => {
      open('words');
      fireEvent.click(tab('Text'));
    };

    it('changes what the text says', () => {
      openText();
      const field = screen.getByRole('textbox', { name: 'Text content' });

      fireEvent.focus(field);
      fireEvent.change(field, { target: { value: 'Goodbye' } });

      expect(words().content).toBe('Goodbye');
    });

    it.each([
      ['Align left', 'left'],
      ['Align center', 'center'],
      ['Align right', 'right'],
    ])('aligns with "%s" and marks it as the one in use', (name, align) => {
      openText();

      fireEvent.click(screen.getByRole('button', { name }));

      expect(words().style.textAlign).toBe(align);
      expect(screen.getByRole('button', { name })).toHaveAttribute(
        'aria-pressed',
        'true',
      );
      expect(screen.getAllByRole('button', { pressed: true })).toHaveLength(1);
    });

    it('changes size and colours without touching the rest of the style', () => {
      openText();

      slide('Font size', '64');
      fireEvent.change(screen.getByLabelText('Text color'), {
        target: { value: '#ff0000' },
      });
      fireEvent.change(screen.getByLabelText('Box background'), {
        target: { value: '#00ff00' },
      });

      expect(words().style).toMatchObject({
        fontSize: 64,
        color: '#ff0000',
        backgroundColor: '#00ff00',
        fontFamily: 'Inter',
        textAlign: 'center',
      });
      expect(screen.getByText('64px')).toBeInTheDocument();
    });

    it('shows black in the pickers for a text with no colour or a see-through box', () => {
      openStudioProject(
        [
          studioTrack('t1', 'text', [
            textClip('words', {
              style: {
                fontFamily: 'Inter',
                fontSize: 40,
                color: '',
                backgroundColor: 'transparent',
                textAlign: 'left',
              },
            }),
          ]),
        ],
        { selectedClipId: 'words' },
      );
      renderWithProviders(<PropertiesPanel />);
      fireEvent.click(tab('Text'));

      expect(screen.getByLabelText('Text color')).toHaveValue('#ffffff');
      expect(screen.getByLabelText('Box background')).toHaveValue('#000000');
    });
  });

  describe('the look of a video', () => {
    it('applies a filter and marks it, with Normal marked when there is none', () => {
      open('clip');
      fireEvent.click(tab('Filters'));
      const marked = (name: string) =>
        screen.getByRole('button', { name }).className.includes('shadow-md');
      expect(marked('Normal')).toBe(true);

      fireEvent.click(screen.getByRole('button', { name: 'Vintage sepia' }));

      expect(studioClip('clip').filter).toBe('sepia(0.8) contrast(1.1)');
      expect(marked('Vintage sepia')).toBe(true);
      expect(marked('Normal')).toBe(false);
      expect(canUndo()).toBe(true);
    });
  });

  describe('sound and speed', () => {
    it('changes the volume, up to twice as loud', () => {
      open('song');
      fireEvent.click(tab('Audio & speed'));

      slide('Volume', '1.5');

      expect(studioClip('song').volume).toBe(1.5);
      expect(screen.getByText('150%')).toBeInTheDocument();
      expect(screen.getByRole('slider', { name: 'Volume' })).toHaveAttribute(
        'max',
        '2',
      );
    });

    it.each([
      ['0.5x', 0.5],
      ['1.5x', 1.5],
      ['2x', 2],
    ])('sets the speed to %s as a step to undo', (name, speed) => {
      open('clip');
      fireEvent.click(tab('Audio & speed'));

      fireEvent.click(screen.getByRole('button', { name }));

      expect(studioClip('clip').speed).toBe(speed);
      expect(canUndo()).toBe(true);
    });
  });
});
