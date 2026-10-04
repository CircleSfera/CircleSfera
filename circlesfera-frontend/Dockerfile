# check=skip=SecretsUsedInArgOrEnv
# Build Stage
FROM node:24-alpine@sha256:ebfe2f90462722a7a4de65e91990e97fe0d401c70e0e762c5b53302f905ec1c1 AS build

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
ENV VITE_API_URL=$VITE_API_URL
ENV VITE_LIVEKIT_URL=$VITE_LIVEKIT_URL
ENV VITE_SENTRY_DSN=$VITE_SENTRY_DSN
ENV VITE_TURNSTILE_SITE_KEY=$VITE_TURNSTILE_SITE_KEY
ENV VITE_MAPBOX_ACCESS_TOKEN=$VITE_MAPBOX_ACCESS_TOKEN

# Build the application
RUN npm run build

# Production Stage
FROM nginx:alpine@sha256:df221db836e1754089190208cee7eeda94f233197056426eda74a43ab1abeac2 AS production

# Copy the built application from the build stage to Nginx html directory
COPY --from=build /app/circlesfera-frontend/dist /usr/share/nginx/html

# Copy custom nginx config
COPY circlesfera-frontend/nginx.conf /etc/nginx/conf.d/default.conf

# Expose port 80
EXPOSE 80

# Start Nginx
CMD ["nginx", "-g", "daemon off;"]
