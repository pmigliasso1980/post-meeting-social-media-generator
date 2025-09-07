import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
async function main() {
  // Seed a default automation template
  // (User-specific records will be created after OAuth sign-in)
  console.log("Seed complete.");
}
main().finally(() => prisma.$disconnect());
