/**
 * End-to-End Encryption (E2EE) Utility using Web Crypto API.
 *
 * Uses RSA-OAEP for key wrapping (encrypting the symmetric key) and
 * AES-GCM for encrypting the actual message content.
 */

export const E2EService = {
  ALGO_ASYM: {
    name: 'RSA-OAEP',
    modulusLength: 2048,
    publicExponent: new Uint8Array([1, 0, 1]),
    hash: 'SHA-256',
  },

  ALGO_SYM: {
    name: 'AES-GCM',
    length: 256,
  },

  /** Generate a new RSA-OAEP Key Pair */
  async generateKeyPair(): Promise<CryptoKeyPair> {
    return window.crypto.subtle.generateKey(this.ALGO_ASYM, true, [
      'encrypt',
      'decrypt',
      'wrapKey',
      'unwrapKey',
    ]);
  },

  /** Export Public Key to Base64 (SPKI) */
  async exportPublicKey(key: CryptoKey): Promise<string> {
    const exported = await window.crypto.subtle.exportKey('spki', key);
    return this.bufferToBase64(exported);
  },

  /** Export Private Key to Base64 (PKCS8) */
  async exportPrivateKey(key: CryptoKey): Promise<string> {
    const exported = await window.crypto.subtle.exportKey('pkcs8', key);
    return this.bufferToBase64(exported);
  },

  /** Import Public Key from Base64 */
  async importPublicKey(base64Key: string): Promise<CryptoKey> {
    const buffer = this.base64ToBuffer(base64Key);
    return window.crypto.subtle.importKey(
      'spki',
      buffer,
      this.ALGO_ASYM,
      true,
      ['encrypt', 'wrapKey'],
    );
  },

  /** Import Private Key from Base64 */
  async importPrivateKey(base64Key: string): Promise<CryptoKey> {
    const buffer = this.base64ToBuffer(base64Key);
    return window.crypto.subtle.importKey(
      'pkcs8',
      buffer,
      this.ALGO_ASYM,
      true,
      ['decrypt', 'unwrapKey'],
    );
  },

  /** Generate a random AES-GCM Symmetric Key */
  async generateSymmetricKey(): Promise<CryptoKey> {
    return window.crypto.subtle.generateKey(this.ALGO_SYM, true, [
      'encrypt',
      'decrypt',
    ]);
  },

  /** Encrypt text using AES-GCM key */
  async encryptMessage(
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
  },

  /** Decrypt text using AES-GCM key */
  async decryptMessage(
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
  },

  /** Export AES Key to Base64 (Raw) */
  async exportSymmetricKey(key: CryptoKey): Promise<string> {
    const exported = await window.crypto.subtle.exportKey('raw', key);
    return this.bufferToBase64(exported);
  },

  /** Import AES Key from Base64 (Raw) */
  async importSymmetricKey(base64Key: string): Promise<CryptoKey> {
    const buffer = this.base64ToBuffer(base64Key);
    return window.crypto.subtle.importKey('raw', buffer, this.ALGO_SYM, true, [
      'encrypt',
      'decrypt',
    ]);
  },

  /** Encrypt File (ArrayBuffer) using AES-GCM */
  async encryptFile(
    buffer: ArrayBuffer,
    aesKey: CryptoKey,
  ): Promise<{ ciphertext: Blob; iv: string }> {
    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    const encrypted = await window.crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      aesKey,
      buffer,
    );
    return {
      ciphertext: new Blob([encrypted]),
      iv: this.bufferToBase64(iv.buffer),
    };
  },

  /** Decrypt File (ArrayBuffer) using AES-GCM */
  async decryptFile(
    buffer: ArrayBuffer,
    ivBase64: string,
    aesKey: CryptoKey,
  ): Promise<Blob> {
    const iv = new Uint8Array(this.base64ToBuffer(ivBase64));
    const decrypted = await window.crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      aesKey,
      buffer,
    );
    return new Blob([decrypted]);
  },

  /** Wrap (Encrypt) AES key with recipient's RSA Public Key */
  async wrapSymmetricKey(
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
  },

  /** Unwrap (Decrypt) AES key with my RSA Private Key */
  async unwrapSymmetricKey(
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
  },

  // --- Utility functions ---
  bufferToBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return window.btoa(binary);
  },

  base64ToBuffer(base64: string): ArrayBuffer {
    const binary = window.atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
  },

  // --- Key Escrow (Password based encryption for Private Key) ---

  /**
   * Derive a 256-bit AES-GCM key from a user password and a static salt.
   * We use PBKDF2 with 100,000 iterations.
   */
  async deriveKeyFromPassword(
    password: string,
    salt: string = 'circlesfera_e2e_salt',
  ): Promise<CryptoKey> {
    const enc = new TextEncoder();
    const keyMaterial = await window.crypto.subtle.importKey(
      'raw',
      enc.encode(password),
      { name: 'PBKDF2' },
      false,
      ['deriveKey'],
    );
    return window.crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt: enc.encode(salt),
        iterations: 100000,
        hash: 'SHA-256',
      },
      keyMaterial,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt'],
    );
  },

  /**
   * Encrypt the exported private key (Base64) using the derived AES key.
   * Returns a payload containing IV and Ciphertext.
   */
  async encryptPrivateKeyWithPassword(
    privateKeyB64: string,
    password: string,
  ): Promise<string> {
    const aesKey = await this.deriveKeyFromPassword(password);
    const { ciphertext, iv } = await this.encryptMessage(privateKeyB64, aesKey);
    // Combine IV and Ciphertext into a single Base64 string for storage
    return btoa(JSON.stringify({ iv, ciphertext }));
  },

  /**
   * Decrypt the stored private key payload using the user password.
   */
  async decryptPrivateKeyWithPassword(
    encryptedPayloadB64: string,
    password: string,
  ): Promise<string> {
    const aesKey = await this.deriveKeyFromPassword(password);
    const payload = JSON.parse(atob(encryptedPayloadB64));
    return this.decryptMessage(payload.ciphertext, payload.iv, aesKey);
  },

  // --- Multi-Device Synchronization ---

  /**
   * Device A: Generates a payload to send the master private key to Device B.
   * Encrypts the master private key with a random AES key, then wraps the AES key
   * using Device B's temporary public key.
   */
  async generateSyncPayload(
    masterPrivateKeyB64: string,
    syncPublicKeyB64: string,
  ): Promise<{ wrappedAesKey: string; ciphertext: string; iv: string }> {
    const aesKey = await this.generateSymmetricKey();
    const { ciphertext, iv } = await this.encryptMessage(
      masterPrivateKeyB64,
      aesKey,
    );

    const syncPublicKey = await this.importPublicKey(syncPublicKeyB64);
    const wrappedAesKey = await this.wrapSymmetricKey(aesKey, syncPublicKey);

    return { wrappedAesKey, ciphertext, iv };
  },

  /**
   * Device B: Decrypts the sync payload received from Device A.
   * Unwraps the AES key using its temporary private key, then decrypts the master private key.
   */
  async decryptSyncPayload(
    wrappedAesKey: string,
    ciphertext: string,
    iv: string,
    syncPrivateKey: CryptoKey,
  ): Promise<string> {
    const aesKey = await this.unwrapSymmetricKey(wrappedAesKey, syncPrivateKey);
    return this.decryptMessage(ciphertext, iv, aesKey);
  },
};
