# Build Stage
FROM node:22-alpine AS build

WORKDIR /app

# Copy shared package
COPY circlesfera-shared ./circlesfera-shared
WORKDIR /app/circlesfera-shared
RUN npm install && npm run build

# Copy frontend package files
WORKDIR /app
COPY circlesfera-frontend/package*.json ./circlesfera-frontend/
COPY biome.json ./biome.json

WORKDIR /app/circlesfera-frontend

# Install dependencies
RUN npm ci

# Copy frontend source code
COPY circlesfera-frontend .

# Declare build arguments for Vite
ARG VITE_API_URL
ENV VITE_API_URL=$VITE_API_URL

# Build the application
RUN npm run build

# Production Stage
FROM nginx:alpine AS production

# Copy the built application from the build stage to Nginx html directory
COPY --from=build /app/circlesfera-frontend/dist /usr/share/nginx/html

# Copy custom nginx config
COPY circlesfera-frontend/nginx.conf /etc/nginx/conf.d/default.conf

# Expose port 80
EXPOSE 80

# Start Nginx
CMD ["nginx", "-g", "daemon off;"]
