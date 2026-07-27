import * as crypto from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/** Fixed scrypt salt used by legacy ciphertext. Do not change without a re-encrypt migration. */
export const ENCRYPTION_SCRYPT_SALT = 'salt';

/** Historical insecure fallback — only used when ENCRYPTION_KEY_LEGACY is set for migration. */
export const LEGACY_DEFAULT_ENCRYPTION_KEY =
  'default-secret-key-32-chars-long!';

@Injectable()
export class CryptoService {
  private readonly logger = new Logger(CryptoService.name);
  private readonly algorithm = 'aes-256-gcm';
  private readonly key: Buffer;
  /** Optional legacy key for read-fallback during ENCRYPTION_KEY rotation. */
  private readonly legacyKey: Buffer | null;

  constructor(private readonly configService: ConfigService) {
    const secret = this.configService.get<string>('ENCRYPTION_KEY');
    if (!secret || secret.includes('CHANGE_ME') || secret.includes('dummy')) {
      throw new Error(
        'SECURITY ALERT: ENCRYPTION_KEY is missing or contains placeholder values. Chat messages cannot be encrypted without a dedicated key.',
      );
    }
    if (secret.length < 32) {
      throw new Error(
        'SECURITY ALERT: ENCRYPTION_KEY must be at least 32 characters.',
      );
    }
    this.key = crypto.scryptSync(secret, ENCRYPTION_SCRYPT_SALT, 32);

    const legacySecret = this.configService.get<string>(
      'ENCRYPTION_KEY_LEGACY',
    );
    if (legacySecret && legacySecret.length >= 32 && legacySecret !== secret) {
      this.legacyKey = crypto.scryptSync(
        legacySecret,
        ENCRYPTION_SCRYPT_SALT,
        32,
      );
      this.logger.warn(
        'ENCRYPTION_KEY_LEGACY is set — decrypt will fall back to the legacy key. Remove it after re-encrypting messages.',
      );
    } else {
      this.legacyKey = null;
    }
  }

  /** Derive an AES key from a raw secret (used by re-encrypt migrations). */
  static deriveKey(secret: string): Buffer {
    return crypto.scryptSync(secret, ENCRYPTION_SCRYPT_SALT, 32);
  }

  encrypt(text: string): string {
    if (!text) return text;

    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(this.algorithm, this.key, iv);

    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    const authTag = cipher.getAuthTag().toString('hex');

    return `${iv.toString('hex')}:${authTag}:${encrypted}`;
  }

  decrypt(encryptedText: string): string {
    if (!encryptedText) return encryptedText;

    const parts = encryptedText.split(':');
    if (parts.length !== 3) return encryptedText; // Not encrypted or old format

    const [ivHex, authTagHex, encryptedHex] = parts;

    if (ivHex.length !== 32 || authTagHex.length !== 32) {
      return encryptedText; // Not our encryption format
    }

    try {
      return this.decryptParts(ivHex, authTagHex, encryptedHex, this.key);
    } catch (primaryErr) {
      if (this.legacyKey) {
        try {
          return this.decryptParts(
            ivHex,
            authTagHex,
            encryptedHex,
            this.legacyKey,
          );
        } catch {
          // Fall through to log primary error
        }
      }
      this.logger.error('Failed to decrypt message', primaryErr);
      return '[Encrypted Message - Key Missing]';
    }
  }

  private decryptParts(
    ivHex: string,
    authTagHex: string,
    encryptedHex: string,
    key: Buffer,
  ): string {
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    const decipher = crypto.createDecipheriv(this.algorithm, key, iv);
    decipher.setAuthTag(authTag);
    let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  }

  /** Decrypt with an arbitrary derived key (migration helper). */
  static decryptWithKey(encryptedText: string, key: Buffer): string {
    const parts = encryptedText.split(':');
    if (parts.length !== 3) {
      throw new Error('Invalid ciphertext format');
    }
    const [ivHex, authTagHex, encryptedHex] = parts;
    if (ivHex.length !== 32 || authTagHex.length !== 32) {
      throw new Error('Invalid ciphertext format');
    }
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag);
    let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  }

  /** Encrypt with an arbitrary derived key (migration helper). */
  static encryptWithKey(text: string, key: Buffer): string {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag().toString('hex');
    return `${iv.toString('hex')}:${authTag}:${encrypted}`;
  }
}
