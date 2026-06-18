/**
 * End-to-End Encryption (E2EE) Utility using Web Crypto API.
 * 
 * Uses RSA-OAEP for key wrapping (encrypting the symmetric key) and
 * AES-GCM for encrypting the actual message content.
 */

export class E2EService {
  private static readonly ALGO_ASYM = {
    name: 'RSA-OAEP',
    modulusLength: 2048,
    publicExponent: new Uint8Array([1, 0, 1]),
    hash: 'SHA-256',
  };

  private static readonly ALGO_SYM = {
    name: 'AES-GCM',
    length: 256,
  };

  /** Generate a new RSA-OAEP Key Pair */
  static async generateKeyPair(): Promise<CryptoKeyPair> {
    return window.crypto.subtle.generateKey(
      this.ALGO_ASYM,
      true,
      ['encrypt', 'decrypt', 'wrapKey', 'unwrapKey'],
    );
  }

  /** Export Public Key to Base64 (SPKI) */
  static async exportPublicKey(key: CryptoKey): Promise<string> {
    const exported = await window.crypto.subtle.exportKey('spki', key);
    return this.bufferToBase64(exported);
  }

  /** Export Private Key to Base64 (PKCS8) */
  static async exportPrivateKey(key: CryptoKey): Promise<string> {
    const exported = await window.crypto.subtle.exportKey('pkcs8', key);
    return this.bufferToBase64(exported);
  }

  /** Import Public Key from Base64 */
  static async importPublicKey(base64Key: string): Promise<CryptoKey> {
    const buffer = this.base64ToBuffer(base64Key);
    return window.crypto.subtle.importKey(
      'spki',
      buffer,
      this.ALGO_ASYM,
      true,
      ['encrypt', 'wrapKey'],
    );
  }

  /** Import Private Key from Base64 */
  static async importPrivateKey(base64Key: string): Promise<CryptoKey> {
    const buffer = this.base64ToBuffer(base64Key);
    return window.crypto.subtle.importKey(
      'pkcs8',
      buffer,
      this.ALGO_ASYM,
      true,
      ['decrypt', 'unwrapKey'],
    );
  }

  /** Generate a random AES-GCM Symmetric Key */
  static async generateSymmetricKey(): Promise<CryptoKey> {
    return window.crypto.subtle.generateKey(
      this.ALGO_SYM,
      true,
      ['encrypt', 'decrypt'],
    );
  }

  /** Encrypt text using AES-GCM key */
  static async encryptMessage(
    text: string,
    aesKey: CryptoKey,
  ): Promise<{ ciphertext: string; iv: string }> {
    const encoder = new TextEncoder();
    const data = encoder.encode(text);
    const iv = window.crypto.getRandomValues(new Uint8Array(12));

    const encrypted = await window.crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      aesKey,
      data,
    );

    return {
      ciphertext: this.bufferToBase64(encrypted),
      iv: this.bufferToBase64(iv.buffer),
    };
  }

  /** Decrypt text using AES-GCM key */
  static async decryptMessage(
    ciphertextBase64: string,
    ivBase64: string,
    aesKey: CryptoKey,
  ): Promise<string> {
    const ciphertext = this.base64ToBuffer(ciphertextBase64);
    const iv = new Uint8Array(this.base64ToBuffer(ivBase64));

    const decrypted = await window.crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      aesKey,
      ciphertext,
    );

    const decoder = new TextDecoder();
    return decoder.decode(decrypted);
  }

  /** Wrap (Encrypt) AES key with recipient's RSA Public Key */
  static async wrapSymmetricKey(
    aesKey: CryptoKey,
    publicKey: CryptoKey,
  ): Promise<string> {
    const wrapped = await window.crypto.subtle.wrapKey(
      'raw',
      aesKey,
      publicKey,
      this.ALGO_ASYM,
    );
    return this.bufferToBase64(wrapped);
  }

  /** Unwrap (Decrypt) AES key with my RSA Private Key */
  static async unwrapSymmetricKey(
    wrappedKeyBase64: string,
    privateKey: CryptoKey,
  ): Promise<CryptoKey> {
    const wrapped = this.base64ToBuffer(wrappedKeyBase64);
    return window.crypto.subtle.unwrapKey(
      'raw',
      wrapped,
      privateKey,
      this.ALGO_ASYM,
      this.ALGO_SYM,
      true,
      ['encrypt', 'decrypt'],
    );
  }

  // --- Utility functions ---
  private static bufferToBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return window.btoa(binary);
  }

  private static base64ToBuffer(base64: string): ArrayBuffer {
    const binary = window.atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
  }
}
