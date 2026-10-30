# Build context is the repository root (see docker-compose.yml).
FROM node:20-alpine AS build
WORKDIR /app
# package-lock.json is optional: it is used when present (after your first npm install + commit).
COPY client/package.json client/package-lock.json* ./
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi
COPY client/ .
RUN npm run build

FROM nginx:alpine
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
