import type { PostTopic } from '@circlesfera/shared';

// What each topic is about, in Spanish and English (posts are written in
// both): each is embedded once, and a post gets the topic whose description
// its own embedding is nearest to. `other` has none: it is what a post gets
// when nothing is near enough. A change here changes the topics given from
// then on; posts that already have one keep it.
export const POST_TOPIC_DESCRIPTIONS: Record<
  Exclude<PostTopic, 'other'>,
  string
> = {
  art_design:
    'Arte y diseño: pintura, dibujo, ilustración, escultura, arte urbano, diseño gráfico, museos y exposiciones. Art and design: painting, drawing, illustration, sculpture, street art, graphic design, museums and exhibitions.',
  photography:
    'Fotografía: cámaras, objetivos, retratos, paisajes, fotografía analógica, edición de fotos. Photography: cameras, lenses, portraits, landscapes, film photography, photo editing.',
  film_video:
    'Cine y vídeo: películas, series, cortometrajes, directores, rodajes, edición de vídeo. Film and video: movies, TV series, short films, directors, filmmaking, video editing.',
  music:
    'Música: canciones, conciertos, festivales de música, bandas, cantantes, instrumentos, discos. Music: songs, concerts, music festivals, bands, singers, instruments, albums.',
  dance:
    'Baile: coreografías, danza, salsa, bachata, hip hop, ballet, clases de baile. Dance: choreography, salsa, bachata, hip hop, ballet, dance classes.',
  comedy:
    'Humor: chistes, memes, monólogos, sketches, bromas, vídeos graciosos. Comedy: jokes, memes, stand-up, sketches, pranks, funny videos.',
  entertainment:
    'Famosos y entretenimiento: celebridades, influencers, programas de televisión, realities, cotilleos, alfombra roja. Celebrities and entertainment: celebrities, influencers, TV shows, reality TV, gossip, red carpet.',
  fashion:
    'Moda: ropa, outfits, estilo, tendencias, zapatillas, accesorios, desfiles. Fashion: clothes, outfits, style, trends, sneakers, accessories, runway shows.',
  beauty:
    'Belleza: maquillaje, cuidado de la piel, peluquería, uñas, perfumes, cosmética. Beauty: makeup, skincare, hairstyles, nails, fragrances, cosmetics.',
  home_decor:
    'Hogar y decoración: interiorismo, muebles, reformas, orden, decoración de casa. Home and decor: interior design, furniture, renovation, tidying, home decoration.',
  food_recipes:
    'Recetas y cocina: cocinar en casa, recetas, repostería, ingredientes, platos caseros. Recipes and cooking: home cooking, recipes, baking, ingredients, homemade dishes.',
  restaurants_bars:
    'Restaurantes y bares: comer fuera, tapas, cafeterías, brunch, cócteles, vinos, reseñas de restaurantes. Restaurants and bars: eating out, tapas, cafés, brunch, cocktails, wine, restaurant reviews.',
  travel:
    'Viajes: destinos, vacaciones, escapadas, hoteles, vuelos, mochileros, turismo. Travel: destinations, holidays, getaways, hotels, flights, backpacking, tourism.',
  nature_outdoors:
    'Naturaleza y aire libre: montaña, senderismo, playa, camping, paisajes naturales, puestas de sol. Nature and outdoors: mountains, hiking, beach, camping, landscapes, sunsets.',
  pets_animals:
    'Animales y mascotas: perros, gatos, cachorros, animales salvajes, adopción de mascotas. Pets and animals: dogs, cats, puppies, wildlife, pet adoption.',
  sports:
    'Deportes: fútbol, baloncesto, tenis, pádel, ciclismo, partidos, equipos, competiciones. Sports: football, basketball, tennis, padel, cycling, matches, teams, competitions.',
  fitness:
    'Fitness y entrenamiento: gimnasio, rutinas de ejercicio, musculación, correr, yoga, crossfit. Fitness and training: gym, workout routines, strength training, running, yoga, crossfit.',
  motoring:
    'Motor: coches, motos, conducción, carreras, Fórmula 1, coches clásicos, mecánica. Motoring: cars, motorbikes, driving, racing, Formula 1, classic cars, mechanics.',
  technology:
    'Tecnología: móviles, ordenadores, gadgets, programación, inteligencia artificial, apps, internet. Technology: smartphones, computers, gadgets, programming, artificial intelligence, apps, the internet.',
  gaming:
    'Videojuegos: consolas, PC gaming, streaming de juegos, esports, partidas. Gaming: video games, consoles, PC gaming, game streaming, esports.',
  science:
    'Ciencia: astronomía, espacio, física, química, experimentos, descubrimientos científicos. Science: astronomy, space, physics, chemistry, experiments, scientific discoveries.',
  learning:
    'Educación y aprendizaje: estudiar, cursos, idiomas, universidad, consejos de estudio, aprender cosas nuevas. Learning: studying, courses, languages, university, study tips, learning new skills.',
  books:
    'Libros y lectura: novelas, recomendaciones de libros, autores, clubes de lectura, poesía. Books and reading: novels, book recommendations, authors, book clubs, poetry.',
  business:
    'Negocios y emprendimiento: empresas, startups, marketing, ventas, emprender, liderazgo, trabajo. Business and entrepreneurship: companies, startups, marketing, sales, entrepreneurship, leadership, work.',
  personal_finance:
    'Finanzas personales: ahorro, presupuesto, inversión, bolsa, criptomonedas, dinero. Personal finance: saving, budgeting, investing, stock market, crypto, money.',
  crafts_diy:
    'Manualidades y bricolaje: hazlo tú mismo, costura, punto, cerámica, carpintería, proyectos caseros. Crafts and DIY: do it yourself, sewing, knitting, pottery, woodworking, home projects.',
  gardening:
    'Jardinería: plantas, huerto, flores, macetas, cultivar, jardín. Gardening: plants, vegetable garden, flowers, pots, growing, garden.',
  parenting:
    'Familia y crianza: hijos, bebés, niños, maternidad, paternidad, planes en familia. Family and parenting: kids, babies, children, motherhood, fatherhood, family activities.',
  weddings_events:
    'Bodas y eventos: bodas, novias, celebraciones, cumpleaños, fiestas, organización de eventos. Weddings and events: weddings, brides, celebrations, birthdays, parties, event planning.',
  shopping_deals:
    'Compras y ofertas: compras, descuentos, rebajas, chollos, productos recomendados, unboxing. Shopping and deals: shopping, discounts, sales, bargains, product recommendations, unboxing.',
  local_culture:
    'Cultura y planes locales: qué hacer en la ciudad, planes de fin de semana, mercados, fiestas populares, teatro, barrio. Local culture and plans: things to do in the city, weekend plans, markets, local festivals, theatre, neighbourhood.',
};

// The subjects no topic may stand for (DSA Art. 26, GDPR Art. 9). They are
// embedded next to the topics only to recognise a post about them: one
// nearer to any of these than to every topic gets `other`, so it is never
// given a topic that sits next to one of them.
export const EXCLUDED_SUBJECT_DESCRIPTIONS: readonly string[] = [
  'Política: partidos, elecciones, gobierno, votar, ideologías, parlamento. Politics: political parties, elections, government, voting, ideology, parliament.',
  'Religión y creencias: fe, iglesia, mezquita, sinagoga, rezar, Dios, espiritualidad. Religion and belief: faith, church, mosque, synagogue, prayer, God, spirituality.',
  'Salud y medicina: enfermedades, síntomas, médicos, hospitales, tratamientos, salud mental, dietas, embarazo. Health and medicine: illness, symptoms, doctors, hospitals, treatments, mental health, diets, pregnancy.',
  'Sexualidad y orientación sexual: sexo, relaciones sexuales, LGTBI, identidad de género. Sexuality and sexual orientation: sex, sexual relationships, LGBTQ, gender identity.',
  'Etnia y origen: raza, origen étnico, racismo, inmigración, nacionalidad. Ethnicity and origin: race, ethnic origin, racism, immigration, nationality.',
  'Sindicatos y huelgas: afiliación sindical, convenios, huelga, derechos laborales. Trade unions and strikes: union membership, collective bargaining, strike, labour rights.',
  'Noticias y actualidad: última hora, periodismo, sucesos, prensa, telediario. News and current affairs: breaking news, journalism, crime reports, press, newscast.',
];
