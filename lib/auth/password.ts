import bcrypt from "bcryptjs";

export async function hashPassword(plain: string): Promise<string> {
  const password = plain.trim();
  if (password.length < 8) {
    throw new Error("Password must be at least 8 characters");
  }
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(
  plain: string,
  hash: string,
): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

