import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import pkg from 'pg';

const { Pool } = pkg;

// The one Help Desk organization of today (CircleSfera's), as its migration
// created it.
const ORGANIZATION_ID = '7c1a4f0e-5b1d-4c7e-9a44-c1dc1e5fe7a0';

// Help centre articles kept here, published as written. A body is text:
// "## " starts a heading, "- " a list item, a blank line a new paragraph.
const ARTICLES = [
  {
    slug: 'team-access-business-profile',
    topic: 'ACCOUNT',
    texts: [
      {
        locale: 'en',
        title: 'Working as a team on a Business profile',
        body: `The owner of a Business profile on the Business plan can invite up to 5 people to work on it. Nobody shares a password: each person uses their own CircleSfera account.

## Invite someone
Go to Settings → Teams, write the person's username, choose a role and send the invitation. The person accepts it from Settings → Teams. To accept, they need two-step verification on.

## Roles
- Administrator: publishes, edits and deletes content, answers comments, sees the statistics and edits the profile.
- Editor: publishes, edits and deletes content, answers comments and sees the statistics.

Only the owner reads direct messages, creates promotions, manages the plan and payouts, manages the team and can delete the profile. Members cannot set a price on content.

## Working as the business
Once accepted, the Business profile appears in the person's profile switcher. What they publish is shown as published by the Business profile.

## Who did what
The owner sees, under Settings → Teams → Team activity, what each person did and when.

## Removing someone
The owner removes a member, or withdraws an invitation, from Settings → Teams. The access ends at once.

## If the Business plan ends
The team is paused, not removed: members cannot enter the profile until the plan returns, and then they get their access back without a new invitation.`,
      },
      {
        locale: 'es',
        title: 'Trabajar en equipo en un perfil Business',
        body: `Quien es dueño de un perfil Business con el plan Business puede invitar a hasta 5 personas a trabajar en él. Nadie comparte contraseña: cada persona usa su propia cuenta de CircleSfera.

## Invitar a alguien
Ve a Ajustes → Equipos, escribe el nombre de usuario de la persona, elige un rol y envía la invitación. La persona la acepta desde Ajustes → Equipos. Para aceptar necesita tener activada la verificación en dos pasos.

## Roles
- Administrador: publica, edita y elimina contenido, responde comentarios, ve las estadísticas y edita el perfil.
- Editor: publica, edita y elimina contenido, responde comentarios y ve las estadísticas.

Solo el dueño lee los mensajes directos, crea promociones, gestiona el plan y los cobros, gestiona el equipo y puede eliminar el perfil. Los miembros no pueden poner precio al contenido.

## Trabajar como la empresa
Una vez aceptada la invitación, el perfil Business aparece en el selector de perfiles de la persona. Lo que publica se muestra como publicado por el perfil Business.

## Quién hizo qué
El dueño ve en Ajustes → Equipos → Actividad del equipo lo que ha hecho cada persona y cuándo.

## Quitar a alguien
El dueño quita a un miembro, o retira una invitación, desde Ajustes → Equipos. El acceso termina en ese momento.

## Si termina el plan Business
El equipo queda en pausa, no se elimina: los miembros no pueden entrar en el perfil hasta que vuelva el plan, y entonces recuperan su acceso sin una nueva invitación.`,
      },
    ],
  },
  {
    slug: 'how-your-feed-works',
    topic: 'CONTENT',
    texts: [
      {
        locale: 'en',
        title: 'Why you see a post: how your feed and recommendations work',
        body: `CircleSfera shows you posts and Frames for reasons you can see. On any post or Frame, open its menu and choose "Why am I seeing this?": it lists the reasons that hold for you, worked out at that moment.

## The reasons
- You follow the author. A follow request that is still pending does not count.
- You are in the author's close friends, for posts shared only with close friends.
- You have liked or commented on the author's posts in the last 90 days, even without following them.
- It has hashtags that appear in posts you liked or saved.
- It is similar to posts you liked, as the "For you" feed measures it.
- It is popular: many people have been interacting with it recently.
- It is recent: published in the last 48 hours.
- It is a promotion that reaches your country. You also see who paid for it.

## What it never tells you
It never says who else liked a post, and it never shows anything about other accounts or about private profiles you cannot see.

## Home and Following
Following shows the posts of the people you follow, newest first. Home ("For you") mixes them with recommendations, ranked by how close you are to the author, how similar the post is to what you like, how popular it is and how recent it is. Every recommendation can be explained with "Why am I seeing this?".

## Changing what you see
From the same menu you can say you are not interested, hide the author or mute them. Muting, unfollowing or blocking also changes what you see. In Settings → Feed Preferences you choose whether sensitive content is shown in For you and Explore, and the words you never want to see.

## Suggested people and search
"Suggested for you" lists the most followed Profiles you do not follow yet, and each one says so. Hashtags are suggested by how many posts use them. Trending audio lists the newest first. The AI search of Profiles finds Profiles whose description matches your search by meaning, and shows how close each match is.

## Promotions
A promoted post is marked as promoted. It reaches the countries its author chose, never with personal data such as your interests or your activity elsewhere.`,
      },
      {
        locale: 'es',
        title:
          'Por qué ves una publicación: cómo funcionan tu feed y las recomendaciones',
        body: `CircleSfera te muestra publicaciones y Frames por motivos que puedes ver. En cualquier publicación o Frame, abre su menú y elige «¿Por qué veo esto?»: verás los motivos que se cumplen para ti, calculados en ese momento.

## Los motivos
- Sigues al autor. Una solicitud de seguimiento pendiente no cuenta.
- Estás en los mejores amigos del autor, en publicaciones compartidas solo con ellos.
- Has dado me gusta o comentado publicaciones del autor en los últimos 90 días, aunque no le sigas.
- Tiene hashtags que aparecen en publicaciones que te gustaron o guardaste.
- Se parece a publicaciones que te gustaron, como lo mide el feed «Para ti».
- Es popular: mucha gente ha interactuado con ella hace poco.
- Es reciente: se publicó en las últimas 48 horas.
- Es una promoción que llega a tu país. También ves quién la pagó.

## Lo que nunca te dice
Nunca dice quién más le dio me gusta a una publicación, ni muestra nada de otras cuentas ni de perfiles privados que no puedes ver.

## Inicio y Siguiendo
Siguiendo muestra las publicaciones de las personas que sigues, las más nuevas primero. Inicio («Para ti») las mezcla con recomendaciones, ordenadas por lo cercano que eres al autor, lo que se parece la publicación a lo que te gusta, lo popular y lo reciente que es. Cada recomendación se puede explicar con «¿Por qué veo esto?».

## Cambiar lo que ves
Desde el mismo menú puedes marcar «No me interesa», ocultar al autor o silenciarlo. Silenciar, dejar de seguir o bloquear también cambia lo que ves. En Ajustes → Preferencias de Feed eliges si se muestra contenido sensible en Para ti y Explorar, y las palabras que no quieres ver.

## Personas sugeridas y búsqueda
«Sugerencias para ti» muestra los perfiles más seguidos que aún no sigues, y cada uno lo dice. Los hashtags se sugieren por cuántas publicaciones los usan. Los audios en tendencia muestran primero los más nuevos. La búsqueda de perfiles con IA encuentra perfiles cuya descripción coincide en significado con tu búsqueda, y muestra cuánto se parece cada uno.

## Promociones
Una publicación promocionada aparece marcada como promocionada. Llega a los países que eligió su autor, nunca con datos personales como tus intereses o tu actividad fuera de CircleSfera.`,
      },
    ],
  },
] as const;

// Creates or updates each article above, in every language it has, and
// publishes it. It prints what would change and changes nothing unless
// APPLY=1. Articles written in the Backoffice and not listed here are never
// touched. Runs with plain Node inside the production image, through the
// "Ops — publish help articles" workflow.
async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL is not set');
  const apply = process.env.APPLY === '1';

  const pool = new Pool({ connectionString });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

  try {
    for (const article of ARTICLES) {
      const stored = await prisma.helpdeskArticle.findUnique({
        where: {
          organizationId_slug: {
            organizationId: ORGANIZATION_ID,
            slug: article.slug,
          },
        },
        include: { texts: true },
      });
      const same =
        stored?.status === 'PUBLISHED' &&
        stored.topic === article.topic &&
        article.texts.every((text) =>
          stored.texts.some(
            (s) =>
              s.locale === text.locale &&
              s.title === text.title &&
              s.body === text.body,
          ),
        );
      console.log(
        `${same ? 'SAME' : apply ? 'PUBLISH' : 'WOULD PUBLISH'} ${article.slug} ` +
          `(${article.texts.map((t) => t.locale).join(', ')})`,
      );
      if (same || !apply) continue;

      await prisma.$transaction(async (tx) => {
        const saved = await tx.helpdeskArticle.upsert({
          where: {
            organizationId_slug: {
              organizationId: ORGANIZATION_ID,
              slug: article.slug,
            },
          },
          create: {
            organizationId: ORGANIZATION_ID,
            slug: article.slug,
            topic: article.topic,
            status: 'PUBLISHED',
            publishedAt: new Date(),
          },
          update: {
            topic: article.topic,
            status: 'PUBLISHED',
            ...(stored?.publishedAt ? {} : { publishedAt: new Date() }),
          },
        });
        for (const text of article.texts) {
          await tx.helpdeskArticleText.upsert({
            where: {
              articleId_locale: { articleId: saved.id, locale: text.locale },
            },
            create: {
              articleId: saved.id,
              locale: text.locale,
              title: text.title,
              body: text.body,
            },
            update: { title: text.title, body: text.body },
          });
        }
      });
    }
    if (!apply) console.log('Dry run: nothing changed.');
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
