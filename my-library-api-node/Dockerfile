FROM node:20-alpine

WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm install

# Copy source code
COPY . .

# Expose port (default 5000 from server.js/.env)
EXPOSE 5000

# Run the app
CMD ["npm", "start"]
