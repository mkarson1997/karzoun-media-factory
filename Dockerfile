FROM node:24-alpine

WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
RUN apk add --no-cache ffmpeg font-dejavu

COPY package.json package-lock.json .npmrc ./
COPY prisma ./prisma
RUN npm ci --include=dev

COPY app ./app
COPY public ./public
COPY scripts ./scripts
COPY src ./src
COPY middleware.ts next.config.mjs tsconfig.json next-env.d.ts eslint.config.mjs ./
RUN npx prisma generate && npm run validate && mkdir -p /app/media && chown node:node /app/media

ENV NODE_ENV=production
USER node
EXPOSE 3000
CMD ["npm", "start"]
