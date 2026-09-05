import type { StoryElement } from '../../types';
import {
  POLL_OPTION_MAX,
  POLL_QUESTION_MAX,
  QNA_PROMPT_MAX,
} from './storyComposer.constants';
import { INTERACTIVE_WIDTH_PCT } from './storyInteractive';

export function buildStickerElement(sticker: string): StoryElement {
  return {
    id: crypto.randomUUID(),
    type: 'sticker',
    content: sticker,
    x: 0,
    y: 0,
    scale: 1.2,
    rotation: 0,
    align: 'center',
    opacity: 1,
  };
}

export function buildPollElement(options: {
  question: string;
  option1: string;
  option2: string;
}): StoryElement | null {
  const question = options.question.trim();
  if (!question) return null;
  return {
    id: crypto.randomUUID(),
    type: 'poll',
    content: JSON.stringify({
      question: question.slice(0, POLL_QUESTION_MAX),
      options: [
        (options.option1.trim() || 'Yes').slice(0, POLL_OPTION_MAX),
        (options.option2.trim() || 'No').slice(0, POLL_OPTION_MAX),
      ],
    }),
    x: 0,
    y: 0,
    scale: 1,
    rotation: 0,
    align: 'center',
    opacity: 1,
    width: INTERACTIVE_WIDTH_PCT,
  };
}

export function buildQnaElement(promptRaw: string): StoryElement | null {
  const prompt = promptRaw.trim();
  if (!prompt) return null;
  return {
    id: crypto.randomUUID(),
    type: 'qna',
    content: JSON.stringify({
      prompt: prompt.slice(0, QNA_PROMPT_MAX),
    }),
    x: 0,
    y: 0,
    scale: 1,
    rotation: 0,
    align: 'center',
    opacity: 1,
    width: INTERACTIVE_WIDTH_PCT,
  };
}
