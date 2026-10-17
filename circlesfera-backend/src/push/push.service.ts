import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import webpush from 'web-push';
import { PrismaService } from '../prisma/prisma.service.js';
import type { SubscribePushDto } from './dto/subscribe.dto.js';
import type { SubscribeNativeDto } from './dto/subscribe-native.dto.js';
import { FcmSender } from './fcm.sender.js';
import { PUSH_GROUP_COLUMN, type PushGroup } from './push-groups.js';

@Injectable()
export class PushService {
  private readonly logger = new Logger(PushService.name);

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(ConfigService) private readonly configService: ConfigService,
    @Inject(FcmSender) private readonly fcm: FcmSender,
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

  // A device of the native app: its token is the person's from now on, also
  // when the device was someone else's before (a shared phone).
  async subscribeNative(userId: string, dto: SubscribeNativeDto) {
    return this.prisma.nativePushToken.upsert({
      where: { token: dto.token },
      create: { userId, token: dto.token, platform: dto.platform },
      update: { userId, platform: dto.platform, lastSeenAt: new Date() },
    });
  }

  // A person takes one of their own devices off; nobody else's.
  async unsubscribeNative(userId: string, token: string) {
    return this.prisma.nativePushToken.deleteMany({
      where: { token, userId },
    });
  }

  // Sends a push to the devices of the person who owns a Profile, unless
  // that Profile paused push or switched off the push's group. Devices are
  // kept by person (the browser subscribes once for the account); what is
  // sent is for one Profile, so the Profile's switches decide. A push with
  // no group (moderation, plan, payment) is stopped only by the pause.
  async sendNotification(
    profileId: string,
    payload: { title: string; body: string; data?: any },
    group: PushGroup | null,
  ) {
    const column = group ? PUSH_GROUP_COLUMN[group] : null;
    const profile = await this.prisma.profile.findUnique({
      where: { id: profileId },
      select: {
        userId: true,
        pushNotifications: true,
        ...(column ? { [column]: true } : {}),
      },
    });
    if (!profile || profile.pushNotifications === false) return;
    if (column && (profile as Record<string, unknown>)[column] === false) {
      return;
    }

    await this.sendNative(profile.userId, payload);

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

  // The same notice to the person's phones and tablets with the native app.
  // A failure here never stops the web push.
  private async sendNative(
    userId: string,
    payload: { title: string; body: string; data?: any },
  ) {
    try {
      const devices = await this.prisma.nativePushToken.findMany({
        where: { userId },
        select: { token: true },
      });
      if (devices.length === 0) return;
      const data: Record<string, string> = {};
      for (const [key, value] of Object.entries(payload.data ?? {})) {
        if (value !== undefined && value !== null) data[key] = String(value);
      }
      const gone = await this.fcm.send(
        devices.map((d) => d.token),
        { title: payload.title, body: payload.body, data },
      );
      if (gone.length > 0) {
        await this.prisma.nativePushToken.deleteMany({
          where: { token: { in: gone } },
        });
      }
    } catch (error) {
      this.logger.error('Failed to send native push', error);
    }
  }
}
