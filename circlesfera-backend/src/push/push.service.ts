import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import webpush from 'web-push';
import { PrismaService } from '../prisma/prisma.service.js';
import type { SubscribePushDto } from './dto/subscribe.dto.js';

@Injectable()
export class PushService {
  private readonly logger = new Logger(PushService.name);

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(ConfigService) private readonly configService: ConfigService,
  ) {
    const publicKey = this.configService.get<string>('VAPID_PUBLIC_KEY');
    const privateKey = this.configService.get<string>('VAPID_PRIVATE_KEY');
    const subject = this.configService.get<string>('VAPID_SUBJECT');

    if (publicKey && privateKey && subject) {
      webpush.setVapidDetails(subject, publicKey, privateKey);
      this.logger.log('VAPID details set for Push Notifications');
    } else {
      this.logger.warn(
        'VAPID details missing. Push Notifications will not work.',
      );
    }
  }

  async subscribe(userId: string, dto: SubscribePushDto) {
    return this.prisma.pushSubscription.upsert({
      where: { endpoint: dto.endpoint },
      create: {
        userId,
        endpoint: dto.endpoint,
        p256dh: dto.keys.p256dh,
        auth: dto.keys.auth,
      },
      update: {
        userId, // Re-bind if endpoint exists but belongs to another session
        p256dh: dto.keys.p256dh,
        auth: dto.keys.auth,
      },
    });
  }

  // A person takes one of their own devices off; nobody else's.
  async unsubscribe(userId: string, endpoint: string) {
    return this.prisma.pushSubscription.deleteMany({
      where: { endpoint, userId },
    });
  }

  // Sends a push to the devices of the person who owns a Profile, when that
  // Profile has push on. Devices are kept by person (the browser subscribes
  // once for the account); what is sent is for one Profile, so the Profile's
  // switch decides.
  async sendNotification(
    profileId: string,
    payload: { title: string; body: string; data?: any },
  ) {
    const profile = await this.prisma.profile.findUnique({
      where: { id: profileId },
      select: { userId: true, pushNotifications: true },
    });
    if (!profile || profile.pushNotifications === false) return;

    const subscriptions = await this.prisma.pushSubscription.findMany({
      where: { userId: profile.userId },
    });

    if (subscriptions.length === 0) return;

    const results = await Promise.allSettled(
      subscriptions.map(async (sub) => {
        try {
          await webpush.sendNotification(
            {
              endpoint: sub.endpoint,
              keys: {
                p256dh: sub.p256dh,
                auth: sub.auth,
              },
            },
            JSON.stringify(payload),
          );
        } catch (error: unknown) {
          // If subscription is expired or invalid, remove it
          const statusCode = (error as { statusCode?: number }).statusCode;
          if (statusCode === 404 || statusCode === 410) {
            await this.prisma.pushSubscription.deleteMany({
              where: { endpoint: sub.endpoint },
            });
            this.logger.log(
              `Removed expired push subscription: ${sub.endpoint}`,
            );
          } else {
            this.logger.error(`Failed to send push to ${sub.endpoint}`, error);
          }
        }
      }),
    );

    return results;
  }
}
