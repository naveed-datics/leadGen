import { createHash, randomBytes, createCipheriv, createDecipheriv } from "node:crypto";

function getMasterKey(): Buffer {
  const secret = process.env.INTEGRATIONS_MASTER_KEY;
  if (!secret || secret.trim().length < 32) {
    throw new Error("INTEGRATIONS_MASTER_KEY must be set and at least 32 characters");
  }

  // Derive a stable 32-byte key from the provided secret.
  return createHash("sha256").update(secret).digest();
}

export function encryptSecret(plain: string): string {
  const text = plain.trim();
  if (!text) throw new Error("Secret cannot be empty");

  const key = getMasterKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return [
    "v1",
    iv.toString("base64"),
    tag.toString("base64"),
    ciphertext.toString("base64"),
  ].join(":");
}

export function decryptSecret(payload: string): string {
  const parts = payload.split(":");
  if (parts.length !== 4 || parts[0] !== "v1") {
    throw new Error("Invalid encrypted payload");
  }
  const [, ivB64, tagB64, ctB64] = parts;
  const iv = Buffer.from(ivB64, "base64");
  const tag = Buffer.from(tagB64, "base64");
  const ciphertext = Buffer.from(ctB64, "base64");

  const key = getMasterKey();
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  const plain = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return plain.toString("utf8");
}

