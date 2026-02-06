FROM node:20-alpine AS base

WORKDIR /app

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# ==================================================
# Dependencies stage
# ==================================================
FROM base AS deps

COPY package.json pnpm-lock.yaml* ./
RUN pnpm install --frozen-lockfile

# ==================================================
# Development stage
# ==================================================
FROM base AS dev

COPY --from=deps /app/node_modules ./node_modules
COPY . .

ENV NODE_ENV=development
EXPOSE 3001

CMD ["pnpm", "dev"]

# ==================================================
# Build stage
# ==================================================
FROM base AS build

COPY --from=deps /app/node_modules ./node_modules
COPY . .

RUN pnpm build

# ==================================================
# Production stage
# ==================================================
FROM base AS production

ENV NODE_ENV=production

COPY --from=build /app/dist ./dist
COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./

EXPOSE 3001

CMD ["node", "dist/index.js"]
