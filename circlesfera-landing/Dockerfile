# Build Stage
FROM node:24-alpine AS build

WORKDIR /app

# Copy landing package files
COPY circlesfera-landing/package*.json ./circlesfera-landing/

WORKDIR /app/circlesfera-landing

# Install dependencies
RUN npm ci

# Copy landing source code
COPY circlesfera-landing .

# Declare build arguments for Vite
ARG VITE_API_URL
ENV VITE_API_URL=$VITE_API_URL

# Build the application
RUN npm run build

# Production Stage
FROM nginx:alpine AS production

# Copy the built application from the build stage to Nginx html directory
COPY --from=build /app/circlesfera-landing/dist /usr/share/nginx/html

# Copy custom nginx config
COPY circlesfera-landing/nginx.conf /etc/nginx/conf.d/default.conf

# Expose port 80
EXPOSE 80

# Start Nginx
CMD ["nginx", "-g", "daemon off;"]
