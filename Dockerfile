FROM node:24-alpine

WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

COPY package.json package-lock.json .npmrc ./
COPY prisma ./prisma
RUN npm ci --include=dev

COPY . .
RUN npx prisma generate && npm run validate && chown -R node:node /app

ENV NODE_ENV=production
USER node
EXPOSE 3000
CMD ["npm", "start"]
