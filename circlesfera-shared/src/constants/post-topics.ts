/**
 * What a post or Frame is about, from a closed list: one topic per post,
 * given in the background from the meaning of its words (PD-084). It is for
 * contextual ads and, later, the interests a person chooses; it is never
 * shown on a post and no public response carries it.
 *
 * The list leaves out, on purpose, every subject an ad may not be aimed at
 * (DSA Art. 26, GDPR Art. 9): politics, religion, health, sexuality,
 * ethnicity, trade unions, and news. A post about one of them gets `other`,
 * never a topic near it. A key is never renamed or removed: posts keep it.
 */
export const POST_TOPICS = [
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
] as const;

export type PostTopic = (typeof POST_TOPICS)[number];

/** The topic of a post that fits none of the others closely enough. */
export const POST_TOPIC_FALLBACK: PostTopic = 'other';

/** Each topic's name in the app's languages. */
export const POST_TOPIC_NAMES: Record<PostTopic, { es: string; en: string }> = {
  art_design: { es: 'Arte y diseño', en: 'Art & design' },
  photography: { es: 'Fotografía', en: 'Photography' },
  film_video: { es: 'Cine y vídeo', en: 'Film & video' },
  music: { es: 'Música', en: 'Music' },
  dance: { es: 'Baile', en: 'Dance' },
  comedy: { es: 'Humor', en: 'Comedy' },
  entertainment: {
    es: 'Famosos y entretenimiento',
    en: 'Celebrities & entertainment',
  },
  fashion: { es: 'Moda', en: 'Fashion' },
  beauty: { es: 'Belleza', en: 'Beauty' },
  home_decor: { es: 'Hogar y decoración', en: 'Home & decor' },
  food_recipes: { es: 'Recetas y cocina', en: 'Recipes & cooking' },
  restaurants_bars: { es: 'Restaurantes y bares', en: 'Restaurants & bars' },
  travel: { es: 'Viajes', en: 'Travel' },
  nature_outdoors: {
    es: 'Naturaleza y aire libre',
    en: 'Nature & outdoors',
  },
  pets_animals: { es: 'Animales y mascotas', en: 'Pets & animals' },
  sports: { es: 'Deportes', en: 'Sports' },
  fitness: { es: 'Fitness y entrenamiento', en: 'Fitness & training' },
  motoring: { es: 'Motor', en: 'Motoring' },
  technology: { es: 'Tecnología', en: 'Technology' },
  gaming: { es: 'Videojuegos', en: 'Gaming' },
  science: { es: 'Ciencia', en: 'Science' },
  learning: { es: 'Educación y aprendizaje', en: 'Learning' },
  books: { es: 'Libros y lectura', en: 'Books & reading' },
  business: {
    es: 'Negocios y emprendimiento',
    en: 'Business & entrepreneurship',
  },
  personal_finance: { es: 'Finanzas personales', en: 'Personal finance' },
  crafts_diy: { es: 'Manualidades y bricolaje', en: 'Crafts & DIY' },
  gardening: { es: 'Jardinería', en: 'Gardening' },
  parenting: { es: 'Familia y crianza', en: 'Family & parenting' },
  weddings_events: { es: 'Bodas y eventos', en: 'Weddings & events' },
  shopping_deals: { es: 'Compras y ofertas', en: 'Shopping & deals' },
  local_culture: {
    es: 'Cultura y planes locales',
    en: 'Local culture & plans',
  },
  other: { es: 'Otros', en: 'Other' },
};
