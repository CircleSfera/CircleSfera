import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';
import pkg from 'pg';

const { Pool } = pkg;

// Realistic User Data
const SEED_USERS = [
  {
    email: 'isabella.arts@circlesfera.com',
    username: 'IsabellaArts',
    fullName: 'Isabella Mendes',
    bio: '🎨 Digital Artist & Illustrator. Exploring colors and shapes.',
    avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&q=80&w=400',
    cover: 'https://images.unsplash.com/photo-1579783902614-a3fb3927b6a5?auto=format&fit=crop&q=80&w=1200',
    role: 'USER',
    accountType: 'CREATOR',
    verificationLevel: 'VERIFIED'
  },
  {
    email: 'marcos.lens@circlesfera.com',
    username: 'MarcosLens',
    fullName: 'Marcos Silva',
    bio: '📸 Street Photographer capturing the essence of the city.',
    avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&q=80&w=400',
    cover: 'https://images.unsplash.com/photo-1493246507139-91e8fad9978e?auto=format&fit=crop&q=80&w=1200',
    role: 'USER',
    accountType: 'CREATOR',
    verificationLevel: 'VERIFIED'
  },
  {
    email: 'elena.tech@circlesfera.com',
    username: 'ElenaTech',
    fullName: 'Elena Rodriguez',
    bio: '💻 Software Engineer & UI/UX enthusiast. Building the future.',
    avatar: 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?auto=format&fit=crop&q=80&w=400',
    cover: 'https://images.unsplash.com/photo-1550751827-4bd374c3f58b?auto=format&fit=crop&q=80&w=1200',
    role: 'USER',
    accountType: 'PERSONAL',
    verificationLevel: 'BASIC'
  },
  {
    email: 'alex.nomad@circlesfera.com',
    username: 'AlexNomad',
    fullName: 'Alex Chen',
    bio: '🌍 Digital Nomad | 30 countries and counting.',
    avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&q=80&w=400',
    cover: 'https://images.unsplash.com/photo-1476514525535-07fb3b4ae5f1?auto=format&fit=crop&q=80&w=1200',
    role: 'USER',
    accountType: 'CREATOR',
    verificationLevel: 'VERIFIED'
  },
  {
    email: 'sophia.style@circlesfera.com',
    username: 'SophiaStyle',
    fullName: 'Sophia Laurent',
    bio: '✨ Fashion & Lifestyle. Life is too short to wear boring clothes.',
    avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&q=80&w=400',
    cover: 'https://images.unsplash.com/photo-1445205170230-053b83016050?auto=format&fit=crop&q=80&w=1200',
    role: 'USER',
    accountType: 'CREATOR',
    verificationLevel: 'VERIFIED'
  }
];

// Realistic Post Data
const POST_DATA = [
  {
    authorUsername: 'IsabellaArts',
    caption: 'Acabo de terminar esta nueva pieza. He intentado jugar con tonos cálidos para transmitir tranquilidad. ¿Qué os parece? 🎨✨',
    image: 'https://images.unsplash.com/photo-1513364776144-60967b0f800f?auto=format&fit=crop&q=80&w=1000'
  },
  {
    authorUsername: 'IsabellaArts',
    caption: 'Mi espacio de trabajo hoy. La inspiración llega cuando el entorno está en armonía. 🌿',
    image: 'https://images.unsplash.com/photo-1501004318641-b39e6451bec6?auto=format&fit=crop&q=80&w=1000'
  },
  {
    authorUsername: 'MarcosLens',
    caption: 'Luces de neón en Tokyo. La ciudad que nunca duerme siempre ofrece la mejor iluminación para mis fotos nocturnas. 📸🌃',
    image: 'https://images.unsplash.com/photo-1503899036084-c55cdd92da26?auto=format&fit=crop&q=80&w=1000'
  },
  {
    authorUsername: 'MarcosLens',
    caption: 'Retrato espontáneo en las calles de Madrid. A veces las mejores fotos no están planeadas.',
    image: 'https://images.unsplash.com/photo-1511895426328-dc8714191300?auto=format&fit=crop&q=80&w=1000'
  },
  {
    authorUsername: 'ElenaTech',
    caption: 'Nuevo setup para programar en casa. Monitores ultra-panorámicos y buen café, no necesito nada más. 💻☕️',
    image: 'https://images.unsplash.com/photo-1498050108023-c5249f4df085?auto=format&fit=crop&q=80&w=1000'
  },
  {
    authorUsername: 'AlexNomad',
    caption: 'Despertar con estas vistas en los Alpes Suizos no tiene precio. El mundo es demasiado grande para quedarse en un solo lugar. 🏔️✈️',
    image: 'https://images.unsplash.com/photo-1469334031218-e382a71b716b?auto=format&fit=crop&q=80&w=1000'
  },
  {
    authorUsername: 'AlexNomad',
    caption: 'Perdido por las calles de Kyoto. La arquitectura tradicional japonesa es simplemente fascinante. 🇯🇵',
    image: 'https://images.unsplash.com/photo-1493976040374-85c8e12f0c0e?auto=format&fit=crop&q=80&w=1000'
  },
  {
    authorUsername: 'SophiaStyle',
    caption: 'Detalles del look de hoy. Menos siempre es más. ✨🤍',
    image: 'https://images.unsplash.com/photo-1434389677669-e08b4cac3105?auto=format&fit=crop&q=80&w=1000'
  },
  {
    authorUsername: 'SophiaStyle',
    caption: 'Coffee break en mi cafetería favorita de París. ☕️🥐',
    image: 'https://images.unsplash.com/photo-1509042239860-f550ce710b93?auto=format&fit=crop&q=80&w=1000'
  },
  {
    authorUsername: 'IsabellaArts',
    caption: 'Bocetos rápidos del fin de semana. A veces hay que soltar la mano y dejar que las ideas fluyan. ✏️',
    image: 'https://images.unsplash.com/photo-1513542789411-b6a5d4f31634?auto=format&fit=crop&q=80&w=1000'
  }
];

async function main() {
  const connectionString = process.env.DATABASE_URL;
  const pool = new Pool({ connectionString });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });

  try {
    console.log('🌱 Iniciando Sembrado (Seed) Premium...');

    const defaultPassword = 'password123';
    const hashedPassword = await argon2.hash(defaultPassword);

    // 1. Crear Planes Base de Plataforma (Stripe IDs mantenidos intactos)
    console.log('📦 Creando Planes de Suscripción...');
    await prisma.platformPlan.upsert({
      where: { stripeProductId: 'prod_UtQGHGBnYo5yGX' },
      update: {},
      create: {
        name: 'Premium',
        description: 'Insignia de verificación, Analíticas básicas y Soporte prioritario.',
        price: 9.99,
        currency: 'EUR',
        interval: 'month',
        stripeProductId: 'prod_UtQGHGBnYo5yGX',
        stripePriceId: 'price_1TtdPZIEniBX3suALJ68LF3d',
        features: ['verified_badge', 'basic_analytics', 'priority_support'],
      },
    });

    await prisma.platformPlan.upsert({
      where: { stripeProductId: 'prod_UtQG21Jd98Vidi' },
      update: {},
      create: {
        name: 'Elite Creator',
        description: 'Herramientas Pro de crecimiento, Insights de audiencia y Spotlight.',
        price: 19.99,
        currency: 'EUR',
        interval: 'month',
        stripeProductId: 'prod_UtQG21Jd98Vidi',
        stripePriceId: 'price_1TtdPZIEniBX3suAnR6uNNsN',
        features: ['pro_growth_tools', 'audience_insights', 'profile_spotlight', 'verified_badge'],
      },
    });

    await prisma.platformPlan.upsert({
      where: { stripeProductId: 'prod_UtQGy36G3SscjF' },
      update: {},
      create: {
        name: 'Business',
        description: 'Verificación de negocio, Gestión multi-cuenta y Soporte 24/7 dedicado.',
        price: 49.99,
        currency: 'EUR',
        interval: 'month',
        stripeProductId: 'prod_UtQGy36G3SscjF',
        stripePriceId: 'price_1TtdPaIEniBX3suAm9IfVW1o',
        features: ['business_verification', 'multi_account', 'dedicated_support', 'api_access_beta'],
      },
    });

    // 2. Cuentas Core
    console.log('👤 Creando Cuentas Administradoras...');
    const adminUser = await prisma.user.upsert({
      where: { email: 'admin@circlesfera.com' },
      update: {},
      create: {
        email: 'admin@circlesfera.com',
        password: hashedPassword,
        role: 'ADMIN',
        accountType: 'BUSINESS',
        verificationLevel: 'BUSINESS',
        profile: {
          create: {
            username: 'CircleSfera',
            fullName: 'Equipo CircleSfera',
            bio: 'Cuenta oficial de administración de CircleSfera. Novedades y soporte.',
            avatar: 'https://images.unsplash.com/photo-1611162617474-5b21e879e113?auto=format&fit=crop&q=80&w=400',
            cover: 'https://images.unsplash.com/photo-1557683316-973673baf926?auto=format&fit=crop&q=80&w=1200'
          },
        },
      },
      include: { profile: true }
    });

    const feliuUser = await prisma.user.upsert({
      where: { email: 'easyfeliu@gmail.com' },
      update: {},
      create: {
        email: 'easyfeliu@gmail.com',
        password: hashedPassword,
        role: 'ADMIN',
        accountType: 'CREATOR',
        verificationLevel: 'VERIFIED',
        profile: {
          create: {
            username: 'EasyFeliu',
            fullName: 'Luis Feliu',
            bio: '🚀 Fundador y Desarrollador de CircleSfera. Construyendo el futuro de las redes sociales.',
            avatar: 'https://images.unsplash.com/photo-1560250097-0b93528c311a?auto=format&fit=crop&q=80&w=400',
            cover: 'https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&q=80&w=1200'
          },
        },
      },
      include: { profile: true }
    });

    // 3. Crear Usuarios Ficticios
    console.log('👥 Creando Ecosistema de Creadores...');
    const createdUsers = [];
    for (const u of SEED_USERS) {
      const user = await prisma.user.upsert({
        where: { email: u.email },
        update: {},
        create: {
          email: u.email,
          password: hashedPassword,
          role: 'USER',
          accountType: u.accountType as any,
          verificationLevel: u.verificationLevel as any,
          profile: {
            create: {
              username: u.username,
              fullName: u.fullName,
              bio: u.bio,
              avatar: u.avatar,
              standardUrl: u.avatar,
              thumbnailUrl: u.avatar,
              cover: u.cover,
              coverStandardUrl: u.cover,
              coverThumbnailUrl: u.cover,
            }
          }
        },
        include: { profile: true }
      });
      createdUsers.push(user);
    }
    
    const allUsers = [feliuUser, ...createdUsers];

    // 4. Crear Posts
    console.log('📸 Creando Publicaciones...');
    const createdPosts = [];
    for (const post of POST_DATA) {
      const author = allUsers.find(u => u.profile?.username === post.authorUsername);
      if (author) {
        const newPost = await prisma.post.create({
          data: {
            userId: author.id,
            caption: post.caption,
            media: {
              create: {
                url: post.image,
                standardUrl: post.image,
                thumbnailUrl: post.image,
                type: 'image',
                altText: post.caption.substring(0, 50)
              }
            }
          }
        });
        createdPosts.push(newPost);
      }
    }

    // 5. Interacciones (Follows, Likes, Comentarios)
    console.log('🤝 Generando Interacciones Sociales...');
    
    // Todos siguen a EasyFeliu y a CircleSfera
    for (const u of createdUsers) {
      await prisma.follow.upsert({
        where: { followerId_followingId: { followerId: u.id, followingId: feliuUser.id } },
        update: {}, create: { followerId: u.id, followingId: feliuUser.id }
      });
      await prisma.follow.upsert({
        where: { followerId_followingId: { followerId: u.id, followingId: adminUser.id } },
        update: {}, create: { followerId: u.id, followingId: adminUser.id }
      });
      // EasyFeliu sigue a algunos creadores
      if (Math.random() > 0.5) {
        await prisma.follow.upsert({
          where: { followerId_followingId: { followerId: feliuUser.id, followingId: u.id } },
          update: {}, create: { followerId: feliuUser.id, followingId: u.id }
        });
      }
    }

    // Likes y Comentarios
    const sampleComments = [
      "¡Me encanta! 😍", "Increíble captura 👏", "Pura inspiración artística.",
      "Qué maravilla de fotografía.", "¡Totalmente de acuerdo contigo!", 
      "Me quedo sin palabras.", "Sigue así 🔥", "Brutal."
    ];

    for (const post of createdPosts) {
      // 2 a 4 likes por post
      const likers = createdUsers.sort(() => 0.5 - Math.random()).slice(0, Math.floor(Math.random() * 3) + 2);
      for (const liker of likers) {
        await prisma.like.upsert({
          where: { postId_userId: { userId: liker.id, postId: post.id } },
          update: {}, create: { userId: liker.id, postId: post.id }
        });
      }

      // 1 a 2 comentarios por post
      const commenters = createdUsers.sort(() => 0.5 - Math.random()).slice(0, Math.floor(Math.random() * 2) + 1);
      for (const commenter of commenters) {
        if (commenter.id !== post.userId) { // Don't comment on own post
          await prisma.comment.create({
            data: {
              userId: commenter.id,
              postId: post.id,
              content: sampleComments[Math.floor(Math.random() * sampleComments.length)]
            }
          });
        }
      }
    }

    console.log('✅ Sembrado Finalizado con Éxito. ¡El frontend ahora lucirá espectacular!');
  } catch (err) {
    console.error('❌ Error en el sembrado de datos:', err);
  } finally {
    await prisma.$disconnect();
  }
}

void main();
