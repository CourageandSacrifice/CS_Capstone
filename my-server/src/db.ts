import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

// Use DATABASE_URL (pooled via pgBouncer) at runtime.
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);

// Singleton — reuse the same client across the server lifetime.
const prisma = new PrismaClient({ adapter } as ConstructorParameters<typeof PrismaClient>[0]);

export default prisma;
