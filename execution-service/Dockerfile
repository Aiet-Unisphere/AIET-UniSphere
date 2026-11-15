# AIET-UniSphere Isolated Execution Service
FROM node:20-alpine AS builder

WORKDIR /app
COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev

COPY --from=builder /app/dist ./dist

# Install Docker CLI so the service can communicate with the host Docker daemon
RUN apk add --no-cache docker-cli

EXPOSE 4000
CMD ["node", "dist/server.js"]

