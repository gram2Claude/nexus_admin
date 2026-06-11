# syntax=docker/dockerfile:1
# nexus_admin (NEXADM-30): multi-stage, Node 22, standalone-вывод Next.js.

FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# DATABASE_URL_APP обязателен в рантайме, но не на сборке (страницы динамические)
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:22-alpine AS run
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
RUN addgroup -S nodejs && adduser -S nextjs -G nodejs
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
# CA-пиннинг Supabase: db.ts читает certs/ из cwd (ревью 2.1)
COPY --from=build /app/certs ./certs
USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
