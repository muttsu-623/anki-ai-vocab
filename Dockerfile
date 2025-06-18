FROM node:18-slim

# Set working directory
WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copy package files first for better caching
COPY package*.json ./
COPY tsconfig.json ./

# Install dependencies (including dev dependencies for TypeScript build)
RUN npm ci

# Copy source code
COPY src/ ./src/

# Build TypeScript
RUN npm run build

# Copy entrypoint script
COPY entrypoint.sh ./entrypoint.sh
RUN chmod +x entrypoint.sh

# Create non-root user (allow existing UID)
RUN useradd -m -u 1001 vocabuser 2>/dev/null || true && chown -R 1001:1001 /app
USER 1001

# Set environment variables
ENV NODE_ENV=production
ENV ANKI_HOST=host.docker.internal

ENTRYPOINT ["/app/entrypoint.sh"]