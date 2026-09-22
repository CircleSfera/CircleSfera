# check=skip=SecretsUsedInArgOrEnv
# Build Stage
FROM node:24-alpine@sha256:50c8e8ca1d27439048670df5883f32d57cf81cff6233222c893fd0d9884cbd81 AS build

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
ENV VITE_API_URL=$VITE_API_URL
ENV VITE_LIVEKIT_URL=$VITE_LIVEKIT_URL
ENV VITE_SENTRY_DSN=$VITE_SENTRY_DSN
ENV VITE_TURNSTILE_SITE_KEY=$VITE_TURNSTILE_SITE_KEY

# Build the application
RUN npm run build

# Production Stage
FROM nginx:alpine@sha256:c8497b180665e631ec92a5091125bec5b214f0e2b99409e30653a125b37557da AS production

# Copy the built application from the build stage to Nginx html directory
COPY --from=build /app/circlesfera-frontend/dist /usr/share/nginx/html

# Copy custom nginx config
COPY circlesfera-frontend/nginx.conf /etc/nginx/conf.d/default.conf

# Expose port 80
EXPOSE 80

# Start Nginx
CMD ["nginx", "-g", "daemon off;"]
