FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json tsconfig.json ./
RUN npm ci --only=production=false

COPY src ./src
COPY config ./config
RUN npm run build

# Production image
FROM node:20-alpine AS production

WORKDIR /app

RUN apk add --no-cache curl

COPY package*.json ./
RUN npm ci --only=production

COPY --from=builder /app/dist ./dist
COPY config ./config

RUN mkdir -p data logs

ENV NODE_ENV=production
EXPOSE 3000

CMD ["node", "dist/index.js"]
