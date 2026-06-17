/*
 * Diagnostic: does a given email+password actually match what's stored?
 * Usage:  node scripts/check-login.js "email@example.com" "thePassword"
 * This mirrors exactly what AuthService.login() does (bcrypt.compare).
 */
require('dotenv/config');
const bcrypt = require('bcrypt');
const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

async function main() {
  const email = (process.argv[2] || '').trim().toLowerCase();
  const password = process.argv[3] || '';

  if (!email || !password) {
    console.log('Usage: node scripts/check-login.js "<email>" "<password>"');
    return;
  }

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, email: true, password: true, createdAt: true },
  });

  if (!user) {
    console.log(`\nNo verified user with email "${email}" → login would 401.`);
    return;
  }

  const ok = await bcrypt.compare(password, user.password);
  console.log(`\nUser found: ${user.email} (id=${user.id}, created ${user.createdAt.toISOString()})`);
  console.log(`Password match: ${ok ? 'YES — login would succeed' : 'NO — this is not the stored password'}`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
