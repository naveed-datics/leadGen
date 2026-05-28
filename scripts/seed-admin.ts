import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db/index";
import { users } from "@/lib/db/schema";
import { hashPassword } from "@/lib/auth/password";

async function main() {
  const email = process.env.ADMIN_EMAIL?.toLowerCase().trim();
  const password = process.env.ADMIN_PASSWORD?.trim();
  const name = process.env.ADMIN_NAME?.trim() || "Admin";

  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not set");
  }

  if (!email) {
    throw new Error("ADMIN_EMAIL is required");
  }

  if (!password) {
    throw new Error("ADMIN_PASSWORD is required");
  }

  const db = getDb();

  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email));

  if (existing) {
    console.log(`Admin already exists for ${email}. Nothing to do.`);
    return;
  }

  const passwordHash = await hashPassword(password);

  const [created] = await db
    .insert(users)
    .values({
      name,
      email,
      passwordHash,
      role: "admin",
      active: true,
      searchEnabled: false,
      whatsAppEnabled: false,
      region: null,
    })
    .returning({ id: users.id });

  console.log(`Seeded admin ${email} with id=${created.id}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

