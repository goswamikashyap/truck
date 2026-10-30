# Build context is the repository root (see docker-compose.yml).
FROM node:20-alpine
WORKDIR /app

# OpenSSL is needed by Prisma on Alpine.
RUN apk add --no-cache openssl

# package-lock.json is optional: it is used when present (after your first npm install + commit).
COPY server/package.json server/package-lock.json* ./
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi

COPY server/ .
RUN npx prisma generate && npm run build

EXPOSE 4000
# Create/update the tables, then start the API.
# "db push" is fine while the schema is still changing. Once you create migrations with
# "npx prisma migrate dev", change this to: npx prisma migrate deploy
CMD ["sh", "-c", "npx prisma db push --skip-generate && node dist/index.js"]
