FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM node:20-alpine AS runtime

WORKDIR /app
ENV NODE_ENV=production

# node:20-alpine ships with a non-root "node" user (uid 1000) — reuse it
# instead of running the app as root, so a container escape or dependency
# exploit does not grant root privileges on the host.
COPY --from=builder --chown=node:node /app/package*.json ./
COPY --from=builder --chown=node:node /app/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/dist ./dist

USER node

EXPOSE 3001

CMD ["node", "dist/server.cjs"]