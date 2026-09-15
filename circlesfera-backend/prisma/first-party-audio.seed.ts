import { type PrismaClient } from '@prisma/client';

/**
 * First-party Sound catalog seed rows (CircleSfera-owned library model).
 * Demo MP3 URLs are SoundHelix examples (free for demos). Production replaces
 * these via Admin → Audio with CDN-hosted, rights-cleared tracks.
 */
export const FIRST_PARTY_AUDIO_SEED = [
  {
    title: 'Ambient Pulse',
    artist: 'CircleSfera Sound',
    url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3',
    duration: 372,
  },
  {
    title: 'Night Drive',
    artist: 'CircleSfera Sound',
    url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3',
    duration: 341,
  },
  {
    title: 'Soft Focus',
    artist: 'CircleSfera Sound',
    url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3',
    duration: 298,
  },
  {
    title: 'City Lights',
    artist: 'CircleSfera Sound',
    url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-8.mp3',
    duration: 312,
  },
  {
    title: 'Golden Hour',
    artist: 'CircleSfera Sound',
    url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-9.mp3',
    duration: 285,
  },
] as const;

export async function seedFirstPartyAudio(prisma: PrismaClient): Promise<void> {
  console.log('Seeding first-party audio catalog...');
  for (const track of FIRST_PARTY_AUDIO_SEED) {
    const existing = await prisma.audio.findFirst({
      where: {
        title: track.title,
        OR: [
          { artist: track.artist },
          { artist: 'CircleSfera' }, // legacy seed-audio artist label
        ],
      },
    });
    if (existing) {
      const needsRefresh =
        existing.url.includes('cdn.circlesfera.com/audio/') ||
        existing.artist !== track.artist ||
        existing.duration !== track.duration;
      if (needsRefresh) {
        await prisma.audio.update({
          where: { id: existing.id },
          data: {
            url: track.url,
            duration: track.duration,
            artist: track.artist,
          },
        });
        console.log(`  updated: ${track.title}`);
      } else {
        console.log(`  skip existing: ${track.title}`);
      }
      continue;
    }
    await prisma.audio.create({ data: { ...track } });
    console.log(`  created: ${track.title}`);
  }
  console.log('First-party audio seeding complete.');
}
