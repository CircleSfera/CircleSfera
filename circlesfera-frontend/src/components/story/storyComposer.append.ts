import type { StoryElement } from '../../types';
import {
  POLL_MAX_OPTIONS,
  POLL_MIN_OPTIONS,
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

/** An interactive piece of the story, at the centre, at the width of a sticker. */
function interactiveElement(
  type: StoryElement['type'],
  content: object,
): StoryElement {
  return {
    id: crypto.randomUUID(),
    type,
    content: JSON.stringify(content),
    x: 0,
    y: 0,
    scale: 1,
    rotation: 0,
    align: 'center',
    opacity: 1,
    width: INTERACTIVE_WIDTH_PCT,
  };
}

/** Trims the options, fills an empty one from the defaults, keeps 2 to 4. */
function cleanOptions(options: string[], defaults: string[]): string[] {
  return options
    .slice(0, POLL_MAX_OPTIONS)
    .map((o, i) => (o.trim() || defaults[i] || '').slice(0, POLL_OPTION_MAX))
    .filter(Boolean);
}

export function buildPollElement(options: {
  question: string;
  /** Two to four answers. */
  options: string[];
  /** The answers used when one is left empty, in the app language. */
  defaultOptions: [string, string];
}): StoryElement | null {
  const question = options.question.trim();
  const answers = cleanOptions(options.options, options.defaultOptions);
  if (!question || answers.length < POLL_MIN_OPTIONS) return null;
  return interactiveElement('poll', {
    question: question.slice(0, POLL_QUESTION_MAX),
    options: answers,
  });
}

/** A quiz: a question, two to four options and the right one. */
export function buildQuizElement(quiz: {
  question: string;
  options: string[];
  correctIndex: number;
}): StoryElement | null {
  const question = quiz.question.trim();
  const options = quiz.options.map((o) => o.trim()).filter(Boolean);
  if (
    !question ||
    options.length < POLL_MIN_OPTIONS ||
    options.length !== quiz.options.length ||
    quiz.correctIndex < 0 ||
    quiz.correctIndex >= options.length
  ) {
    return null;
  }
  return interactiveElement('quiz', {
    question: question.slice(0, POLL_QUESTION_MAX),
    options: options
      .slice(0, POLL_MAX_OPTIONS)
      .map((o) => o.slice(0, POLL_OPTION_MAX)),
    correctIndex: quiz.correctIndex,
  });
}

/** A slider: a question, which may be empty, and its emoji. */
export function buildSliderElement(slider: {
  question: string;
  emoji: string;
}): StoryElement | null {
  if (!slider.emoji) return null;
  return interactiveElement('slider', {
    question: slider.question.trim().slice(0, POLL_QUESTION_MAX),
    emoji: slider.emoji,
  });
}

/** The longest title of a countdown. */
export const COUNTDOWN_TITLE_MAX = 40;

/** A countdown: its title and when it ends, at least a minute ahead. */
export function buildCountdownElement(countdown: {
  title: string;
  endsAt: Date;
}): StoryElement | null {
  const title = countdown.title.trim().slice(0, COUNTDOWN_TITLE_MAX);
  const ends = countdown.endsAt.getTime();
  if (!title || Number.isNaN(ends) || ends < Date.now() + 60_000) return null;
  return interactiveElement('countdown', {
    title,
    endsAt: new Date(ends).toISOString(),
  });
}

/** The tag of a hashtag without its #, or null if it has none. */
export function cleanHashtag(raw: string): string | null {
  const tag = raw.trim().replace(/^#+/, '').replace(/\s+/g, '');
  return /^[\p{L}\p{N}_]{1,50}$/u.test(tag) ? tag : null;
}

/** A hashtag: letters, numbers and _, opened by viewers from the story. */
export function buildHashtagElement(raw: string): StoryElement | null {
  const tag = cleanHashtag(raw);
  if (!tag) return null;
  return {
    id: crypto.randomUUID(),
    type: 'hashtag',
    content: JSON.stringify({ tag }),
    x: 0,
    y: 0,
    scale: 1.2,
    rotation: 0,
    align: 'center',
    opacity: 1,
  };
}

/** A pill with free sizes, as a hashtag, a mention or a place. */
const pillElement = (
  type: 'mention' | 'location' | 'link' | 'music',
  content: object,
): StoryElement => ({
  id: crypto.randomUUID(),
  type,
  content: JSON.stringify(content),
  x: 0,
  y: 0,
  scale: 1.2,
  rotation: 0,
  align: 'center',
  opacity: 1,
});

/** A mention of a profile, opened by viewers from the story. */
export function buildMentionElement(profile: {
  id: string;
  username: string;
}): StoryElement {
  return pillElement('mention', {
    profileId: profile.id,
    username: profile.username,
  });
}

/** A question and one of its answers, shared by the author as a card. */
export function buildAnswerElement(card: {
  prompt: string;
  answer: string;
}): StoryElement {
  return {
    ...interactiveElement('answer', {
      prompt: card.prompt.slice(0, QNA_PROMPT_MAX),
      answer: card.answer,
    }),
    // Above the middle, where the answer is read before the rest.
    y: -80,
  };
}

/** The song of the story, as its music sticker shows it. */
export function buildMusicElement(track: {
  title: string;
  artist: string;
  cover: string | null;
}): StoryElement {
  return pillElement('music', track);
}

/** The longest text shown instead of a link's domain. */
export const LINK_LABEL_MAX = 30;

/**
 * A link as typed, ready for the server's own checks: https added when no
 * scheme is written; http, other schemes, other ports than 443 and names
 * without a dot refused.
 */
export function cleanLink(
  raw: string,
): { url: string; domain: string } | 'http' | null {
  const text = raw.trim();
  if (!text) return null;
  if (/^http:\/\//i.test(text)) return 'http';
  // example.com:443/x is a domain and a port, not a scheme.
  const hostAndPort = /^[^/:]+\.[^/:]+:\d+(?:[/?#]|$)/.test(text);
  const withScheme =
    !hostAndPort && /^[a-z][a-z0-9+.-]*:/i.test(text)
      ? text
      : `https://${text}`;
  try {
    const url = new URL(withScheme);
    if (url.protocol !== 'https:' || !url.hostname.includes('.')) return null;
    // Links open on the usual port only, as the server keeps them.
    if (url.port && url.port !== '443') return null;
    return { url: url.href, domain: url.hostname.replace(/^www\./, '') };
  } catch {
    return null;
  }
}

/** A link, opened by viewers after saying they are leaving CircleSfera. */
export function buildLinkElement(link: {
  url: string;
  label?: string;
}): StoryElement | null {
  const cleaned = cleanLink(link.url);
  if (!cleaned || cleaned === 'http') return null;
  const label = link.label?.trim().slice(0, LINK_LABEL_MAX);
  return pillElement('link', {
    url: cleaned.url,
    domain: cleaned.domain,
    ...(label ? { label } : {}),
  });
}

/** The place of the story, by its name; the server gives it the place. */
export function buildLocationElement(name: string): StoryElement {
  return pillElement('location', { name });
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
