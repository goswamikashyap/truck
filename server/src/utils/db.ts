import { PrismaClient } from "@prisma/client";

// One shared client for the whole server.
export const prisma = new PrismaClient();
