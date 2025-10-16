FROM node:18-alpine

WORKDIR /app

# Install only prod deps (layer-cached)
COPY package*.json ./
RUN npm ci --only=production || npm install --production

# Now copy the app code
COPY server.js .

EXPOSE 8081
CMD ["node", "server.js"]
