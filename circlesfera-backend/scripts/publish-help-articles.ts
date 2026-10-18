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
