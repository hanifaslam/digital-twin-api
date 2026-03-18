FROM node:22-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY prisma ./prisma
COPY prisma.config.ts ./
RUN npx prisma generate

COPY src ./src

# Add curl for healthcheck
RUN apk add --no-cache curl

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3000/health || exit 1

CMD ["sh", "-c", "npx prisma migrate deploy && node src/app.js"]
