FROM node:22-alpine

WORKDIR /app

# install deps first (better cache)
COPY package*.json ./
RUN npm ci --omit=dev

# copy the rest
COPY . .

ENV NODE_ENV=production
EXPOSE 8080

# Cloud Run sets PORT=8080 by default
CMD ["node", "app.js"]