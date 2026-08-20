FROM node:24-alpine

WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

COPY package.json ./
RUN npm install

COPY . .
RUN npx prisma generate && npm run build

EXPOSE 3000
CMD ["npm", "start"]
