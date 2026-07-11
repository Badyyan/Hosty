/**
 * Seed a demo account for local development.
 *   email:    demo@hosty.site
 *   password: password123
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const passwordHash = await bcrypt.hash("password123", 12);
  const user = await prisma.user.upsert({
    where: { email: "demo@hosty.site" },
    update: {},
    create: {
      email: "demo@hosty.site",
      name: "Demo User",
      passwordHash,
      emailVerified: new Date(),
      subscription: { create: { plan: "PRO" } },
    },
  });
  console.log(`Seeded demo user ${user.email}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
