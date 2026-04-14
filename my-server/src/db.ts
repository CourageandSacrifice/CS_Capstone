import { PrismaClient } from '@prisma/client';

// Singleton — reuse the same client across the server lifetime.
// Uses DATABASE_URL env var directly via Prisma's built-in connection.
const prisma = new PrismaClient();

export default prisma;
