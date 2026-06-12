# Build Stage
FROM node:22-alpine AS build

WORKDIR /app

# Copy and build shared package (dependency)
COPY circlesfera-shared ./circlesfera-shared
WORKDIR /app/circlesfera-shared
RUN npm install && npm run build

WORKDIR /app

# Copy backend package files
COPY circlesfera-backend/package*.json ./circlesfera-backend/
COPY circlesfera-backend/prisma ./circlesfera-backend/prisma/

WORKDIR /app/circlesfera-backend

# Install dependencies
RUN npm install

# Copy backend source code
COPY circlesfera-backend .
RUN rm -f prisma.config.ts

# Generate Prisma Client
RUN npx prisma generate

# Build the application
RUN npm run build

# Production Stage
FROM node:22-alpine AS production

WORKDIR /app

# Copy compiled shared package from build stage
COPY --chown=node:node --from=build /app/circlesfera-shared ./circlesfera-shared

WORKDIR /app/circlesfera-backend

# Copy package files and prisma for runtime
COPY --chown=node:node circlesfera-backend/package*.json ./
COPY --chown=node:node circlesfera-backend/prisma ./prisma/
COPY --chown=node:node circlesfera-backend/prisma.config.ts ./

# Create uploads directory and set permissions
RUN mkdir -p uploads && chown -R node:node uploads

# Install only production dependencies
RUN apk add --no-cache openssl
RUN npm install --omit=dev

# Copy the built application from the build stage
COPY --chown=node:node --from=build /app/circlesfera-backend/dist ./dist
COPY --chown=node:node --from=build /app/circlesfera-backend/node_modules/.prisma ./node_modules/.prisma

# Set environment variables
ENV NODE_ENV=production

# Expose the application port
EXPOSE 3000

# Start the application
USER node
CMD ["node", "dist/src/main"]
