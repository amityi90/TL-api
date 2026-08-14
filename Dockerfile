FROM node:22-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

# Cloud Run injects PORT; server.js already reads it.
ENV NODE_ENV=production
USER node

CMD ["node", "server.js"]
