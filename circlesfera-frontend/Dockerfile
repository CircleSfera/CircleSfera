# check=skip=SecretsUsedInArgOrEnv
# Build Stage
# Base images come from the public mirror of Docker's official images, at
# the same pinned digest: Docker Hub limits anonymous downloads per address,
# and the build runners share theirs. The deploys build from the
# repository's own copy of these same digests instead
# (scripts/use-own-base-images.sh): the public mirror also stops serving once
# its allowance is used up.
FROM public.ecr.aws/docker/library/node:24-alpine@sha256:8a32c8cf649a49915a66e81e7a609223c708d0adabf288ee3f4077d765542f85 AS build

WORKDIR /app

# Copy shared package
COPY circlesfera-shared ./circlesfera-shared
WORKDIR /app/circlesfera-shared
RUN npm ci && npm run build

# Copy frontend package files
WORKDIR /app
COPY circlesfera-frontend/package*.json ./circlesfera-frontend/
COPY biome.json ./biome.json

WORKDIR /app/circlesfera-frontend

# Install dependencies
RUN npm ci

# Copy frontend source code
COPY circlesfera-frontend .

# Declare build arguments for Vite (baked into the SPA at build time)
ARG VITE_API_URL
ARG VITE_LIVEKIT_URL
ARG VITE_SENTRY_DSN
ARG VITE_TURNSTILE_SITE_KEY
ARG VITE_MAPBOX_ACCESS_TOKEN
# "true" shows recorded broadcasts; anything else hides them.
ARG VITE_LIVE_RECORDING_ENABLED=false
ARG VITE_SENTRY_RELEASE
ENV VITE_API_URL=$VITE_API_URL
ENV VITE_LIVEKIT_URL=$VITE_LIVEKIT_URL
ENV VITE_SENTRY_DSN=$VITE_SENTRY_DSN
ENV VITE_TURNSTILE_SITE_KEY=$VITE_TURNSTILE_SITE_KEY
ENV VITE_MAPBOX_ACCESS_TOKEN=$VITE_MAPBOX_ACCESS_TOKEN
ENV VITE_LIVE_RECORDING_ENABLED=$VITE_LIVE_RECORDING_ENABLED
ENV VITE_SENTRY_RELEASE=$VITE_SENTRY_RELEASE

# Build the application
RUN npm run build

# Production Stage
FROM public.ecr.aws/docker/library/nginx:alpine@sha256:785835ea65db4bba6f021acc0f3be91b0fef76a53fe41f8588c6698d2aed0606 AS production

# Copy the built application from the build stage to Nginx html directory
COPY --from=build /app/circlesfera-frontend/dist /usr/share/nginx/html

# Copy custom nginx config
COPY circlesfera-frontend/nginx.conf /etc/nginx/conf.d/default.conf

# Expose port 80
EXPOSE 80

# Start Nginx
CMD ["nginx", "-g", "daemon off;"]
