import crypto from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // 96 bits for GCM
const TAG_LENGTH = 16; // 128 bits auth tag

function getEncryptionKey(): Buffer {
  const hexKey = process.env.TOKEN_ENCRYPTION_KEY;
  if (!hexKey) {
    // In local dev without key, provide a fallback derived key
    if (process.env.NODE_ENV !== "production") {
      return crypto.createHash("sha256").update("local-dev-fallback-key-32-bytes!").digest();
    }
    throw new Error("TOKEN_ENCRYPTION_KEY environment variable is required");
  }
  return Buffer.from(hexKey, "hex");
}

/**
 * Encrypts a plaintext string (e.g. OAuth token) using AES-256-GCM.
 * Packed as: [IV (12 bytes)] + [Auth Tag (16 bytes)] + [Ciphertext]
 */
export function encryptToken(plaintext: string): Buffer {
  if (plaintext === null || plaintext === undefined) {
    throw new TypeError("encryptToken requires a string, received null or undefined");
  }

  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  const ciphertext = Buffer.concat([
    cipher.update(String(plaintext), "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return Buffer.concat([iv, authTag, ciphertext]);
}

/**
 * Decrypts an AES-256-GCM sealed buffer.
 */
export function decryptToken(sealed: Buffer): string {
  if (!sealed || !Buffer.isBuffer(sealed)) {
    throw new TypeError("decryptToken requires a Buffer");
  }

  if (sealed.length < IV_LENGTH + TAG_LENGTH) {
    throw new Error("Invalid sealed buffer: payload too short");
  }

  const key = getEncryptionKey();
  const iv = sealed.subarray(0, IV_LENGTH);
  const authTag = sealed.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
  const ciphertext = sealed.subarray(IV_LENGTH + TAG_LENGTH);

  try {
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    const decrypted = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]);

    return decrypted.toString("utf8");
  } catch (err) {
    throw new Error(
      `Decryption failed: corrupted payload or authentication tag mismatch (${err instanceof Error ? err.message : String(err)})`
    );
  }
}
