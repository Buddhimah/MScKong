FROM node:18-alpine

WORKDIR /app

# Copy dependency files first (for caching)
COPY package*.json ./

# Install only production dependencies
RUN npm ci --only=production || npm install --production

# Copy the app source code
COPY server.js .

# Expose app port
EXPOSE 8080

# Start the app
CMD ["node", "server.js"]
