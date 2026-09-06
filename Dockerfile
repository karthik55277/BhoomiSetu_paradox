# Stage 1: Build React static assets with relative /api base URL
FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

# Set relative /api base URL for production Nginx reverse proxying
ENV VITE_API_BASE_URL=/api
RUN npm run build

# Stage 2: Serve React SPA with Nginx
FROM nginx:1.25-alpine

# Install curl for container healthcheck
RUN apk add --no-cache curl

COPY --from=builder /app/dist /usr/share/nginx/html
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

HEALTHCHECK --interval=10s --timeout=5s --start-period=5s --retries=3 \
    CMD curl -f http://localhost/health-web || exit 1

CMD ["nginx", "-g", "daemon off;"]
