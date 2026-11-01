# Build Stage
# Base images come from the public mirror of Docker's official images, at
# the same pinned digest: Docker Hub limits anonymous downloads per address,
# and the build runners share theirs. The deploys build from the
# repository's own copy of these same digests instead
# (scripts/use-own-base-images.sh): the public mirror also stops serving once
# its allowance is used up.
FROM public.ecr.aws/docker/library/node:24-alpine@sha256:8a32c8cf649a49915a66e81e7a609223c708d0adabf288ee3f4077d765542f85 AS build

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
FROM public.ecr.aws/docker/library/node:24-alpine@sha256:8a32c8cf649a49915a66e81e7a609223c708d0adabf288ee3f4077d765542f85 AS production

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
# Nothing runs npm once the image is built (migrations call the Prisma CLI
# directly), so npm, npx and corepack leave the image with their own
# dependencies.
RUN npm cache clean --force \
  && rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack \
     /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack

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
