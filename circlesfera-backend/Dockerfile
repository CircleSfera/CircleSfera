# Build Stage
# Base images come from the public mirror of Docker's official images, at
# the same pinned digest: Docker Hub limits anonymous downloads per address,
# and the build runners share theirs. The deploys build from the
# repository's own copy of these same digests instead
# (scripts/use-own-base-images.sh): the public mirror also stops serving once
# its allowance is used up.
FROM public.ecr.aws/docker/library/node:24-alpine@sha256:06d7adf3e0ef61a13f1d28682726366f97a15aa1888c934d3ecec86c33918b53 AS build

WORKDIR /app

# Copy and build shared package (dependency)
COPY circlesfera-shared ./circlesfera-shared
WORKDIR /app/circlesfera-shared
RUN npm ci && npm run build

WORKDIR /app

# Copy backend package files
COPY circlesfera-backend/package*.json ./circlesfera-backend/
COPY circlesfera-backend/prisma ./circlesfera-backend/prisma/

WORKDIR /app/circlesfera-backend

# Install build dependencies including ffmpeg for local dev/testing
RUN apk add --no-cache ffmpeg

# Install dependencies
RUN npm ci

# Copy backend source code
COPY circlesfera-backend .

# Generate Prisma Client
RUN npx prisma generate

# Build the application
RUN npm run build

# Production Stage
FROM public.ecr.aws/docker/library/node:24-alpine@sha256:06d7adf3e0ef61a13f1d28682726366f97a15aa1888c934d3ecec86c33918b53 AS production

WORKDIR /app

# Copy compiled shared package from build stage
COPY --chown=node:node --from=build /app/circlesfera-shared ./circlesfera-shared

WORKDIR /app/circlesfera-backend

# Copy package files and prisma for runtime
COPY --chown=node:node circlesfera-backend/package*.json ./
COPY --chown=node:node circlesfera-backend/prisma ./prisma/
# prisma.config.ts is required by Prisma 7 to resolve DATABASE_URL at migrate/runtime
COPY --chown=node:node circlesfera-backend/prisma.config.ts ./

# Create uploads directory and set permissions
RUN mkdir -p uploads && chown -R node:node uploads

# Install only production dependencies
RUN apk add --no-cache ffmpeg
RUN npm ci --omit=dev

# Copy the built application from the build stage
COPY --chown=node:node --from=build /app/circlesfera-backend/dist ./dist
COPY --chown=node:node --from=build /app/circlesfera-backend/node_modules/.prisma ./node_modules/.prisma
COPY --chown=node:node circlesfera-backend/scripts ./scripts/
RUN chmod +x ./scripts/prisma-migrate-deploy.sh

# Set environment variables
ENV NODE_ENV=production
# The commit the image was built from; Sentry names it as the release. Last,
# so a new commit does not undo the cached layers above.
ARG SENTRY_RELEASE
ENV SENTRY_RELEASE=$SENTRY_RELEASE

# Expose the application port
EXPOSE 3000

# Start the application
USER node
CMD ["node", "dist/main"]
