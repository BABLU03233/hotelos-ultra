# One image, two roles: the web server (default CMD) and the background
# worker (override CMD to `npm run worker:start` when deploying that
# service — see README.md "Deployment"). Both need the full node_modules
# (the worker isn't part of the Next.js bundle), so this deliberately
# skips Next's "standalone" output mode in favor of a simpler, single
# runtime image.

FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# prisma.config.ts resolves DATABASE_URL eagerly; `generate` only reads
# schema.prisma and never connects, so a placeholder is fine at build time —
# the real value is injected into the running container at deploy time.
ENV DATABASE_URL="postgresql://placeholder:placeholder@localhost:5432/placeholder"
RUN npx prisma generate
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/.next ./.next
COPY --from=build /app/public ./public
COPY --from=build /app/src ./src
COPY --from=build /app/prisma ./prisma
# scripts/ ships too: the OmniRoute gateway these tools talk to is only
# reachable on the internal Docker network and is never exposed publicly, so
# ai-code / e2e / soak / quality can ONLY be run from inside this image.
# Without this they were dead weight in the repo — present locally, absent
# exactly where they had to run.
COPY --from=build /app/scripts ./scripts
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/next.config.ts ./next.config.ts
COPY --from=build /app/tsconfig.json ./tsconfig.json
COPY --from=build /app/prisma.config.ts ./prisma.config.ts

EXPOSE 3000
CMD ["npm", "start"]
