import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  AD_INTEREST_TOPICS,
  POST_TOPIC_FALLBACK,
  POST_TOPICS,
} from '@circlesfera/shared';
import { PostTopic } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import {
  EXCLUDED_SUBJECT_DESCRIPTIONS,
  POST_TOPIC_DESCRIPTIONS,
} from './post-topic-descriptions.js';

// The names people read, in the app's translations (Settings → Ads → Your
// interests): `other` is never chosen, so it has none.
const TOPIC_NAMES = Object.fromEntries(
  (['es', 'en'] as const).map((language) => [
    language,
    (
      JSON.parse(
        readFileSync(
          join(
            import.meta.dirname,
            `../../../../circlesfera-frontend/src/locales/${language}.json`,
          ),
          'utf8',
        ),
      ) as { adInterests: { topics: Record<string, string> } }
    ).adInterests.topics,
  ]),
) as Record<'es' | 'en', Record<string, string>>;

// The subjects an ad may not be aimed at (DSA Art. 26, GDPR Art. 9), in
// English and Spanish: none may name a topic or describe one.
const EXCLUDED_WORDS = [
  /\bpolitic/i,
  /\bpolític/i,
  /\belect(ion|oral)/i,
  /\belecci/i,
  /\bgovern/i,
  /\bgobiern/i,
  /\bparlia?ment/i,
  /\bvot(e|ing|o|ar)\b/i,
  /\breligi/i,
  /\bfaith\b/i,
  /\bchurch/i,
  /\biglesia/i,
  /\bmosque|\bmezquita/i,
  /\bsynagogue|\bsinagoga/i,
  /\bpray|\brezar/i,
  /\bgods?\b|\bdios\b/i,
  /\bspiritual|\bespiritual/i,
  /\bhealth/i,
  /\bsalud\b/i,
  /\bmedic/i,
  /\bmédic/i,
  /\bhospital/i,
  /\bdisease|\billness|\benfermedad/i,
  /\btherap|\bterapia/i,
  /\bmental\b/i,
  /\bdiets?\b|\bdietas?\b/i,
  /\bpregnan|\bembaraz/i,
  /\bsex/i,
  /\blgb/i,
  /\bgender|\bgénero/i,
  /\bethnic|étnic|\betnia/i,
  /\brac(e|ism)\b|\braza\b|\bracismo/i,
  /\bimmigra|\binmigra/i,
  /\bunions?\b|\bsindica/i,
  /\bstrikes?\b|\bhuelga/i,
  /\bnews\b|\bnoticia/i,
  /\bjournalis|\bperiodis/i,
  /\bactualidad\b|\bcurrent affairs\b/i,
];

const DECIDED_TOPICS = [
  'art_design',
  'photography',
  'film_video',
  'music',
  'dance',
  'comedy',
  'entertainment',
  'fashion',
  'beauty',
  'home_decor',
  'food_recipes',
  'restaurants_bars',
  'travel',
  'nature_outdoors',
  'pets_animals',
  'sports',
  'fitness',
  'motoring',
  'technology',
  'gaming',
  'science',
  'learning',
  'books',
  'business',
  'personal_finance',
  'crafts_diy',
  'gardening',
  'parenting',
  'weddings_events',
  'shopping_deals',
  'local_culture',
  'other',
];

describe('the closed list of post topics', () => {
  it('is the list decided, with `other` as the fallback', () => {
    expect([...POST_TOPICS]).toEqual(DECIDED_TOPICS);
    expect(POST_TOPIC_FALLBACK).toBe('other');
  });

  it('is the same list in the database, value for value', () => {
    expect(Object.values(PostTopic).sort()).toEqual([...POST_TOPICS].sort());
  });

  it('offers every topic but `other` as an interest, in the order of the list', () => {
    expect([...AD_INTEREST_TOPICS]).toEqual(
      POST_TOPICS.filter((t) => t !== 'other'),
    );
  });

  it('names every topic a person can choose in Spanish and English, and no other', () => {
    for (const language of ['es', 'en'] as const) {
      expect(Object.keys(TOPIC_NAMES[language]).sort()).toEqual(
        [...AD_INTEREST_TOPICS].sort(),
      );
      for (const topic of AD_INTEREST_TOPICS) {
        expect(TOPIC_NAMES[language][topic].trim()).not.toBe('');
      }
    }
  });

  it('describes every topic but `other`, which is what is left', () => {
    expect(Object.keys(POST_TOPIC_DESCRIPTIONS).sort()).toEqual(
      POST_TOPICS.filter((t) => t !== 'other').sort(),
    );
  });

  it('holds no subject an ad may not be aimed at: not in a key, a name or a description', () => {
    const texts = [
      ...POST_TOPICS,
      ...POST_TOPICS.map((t) => t.replace(/_/g, ' ')),
      ...Object.values(TOPIC_NAMES.es),
      ...Object.values(TOPIC_NAMES.en),
      ...Object.values(POST_TOPIC_DESCRIPTIONS),
    ];
    for (const text of texts) {
      for (const word of EXCLUDED_WORDS) {
        expect(word.test(text), `"${text}" matches ${word}`).toBe(false);
      }
    }
  });

  it('recognises each excluded subject, so a post about one gets `other`', () => {
    const subjects = [
      /politic/i,
      /religi/i,
      /health/i,
      /sexual/i,
      /ethnic/i,
      /union/i,
      /news/i,
    ];
    for (const subject of subjects) {
      expect(
        EXCLUDED_SUBJECT_DESCRIPTIONS.some((d) => subject.test(d)),
        `${subject}`,
      ).toBe(true);
    }
  });

  it('the deny-list catches the words it is there for', () => {
    for (const text of [
      'Politics',
      'Religión',
      'Health & wellbeing',
      'Salud',
      'Sexuality',
      'Ethnicity',
      'Trade unions',
      'News',
      'Noticias',
    ]) {
      expect(
        EXCLUDED_WORDS.some((w) => w.test(text)),
        text,
      ).toBe(true);
    }
  });
});
