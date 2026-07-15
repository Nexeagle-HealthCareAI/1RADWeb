# Serve the pre-built assets using a lightweight Caddy image
# Note: The 'dist' directory is built in Stage 1 of the GitHub Actions pipeline
FROM caddy:2-alpine
COPY dist /usr/share/caddy
COPY Caddyfile /etc/caddy/Caddyfile
EXPOSE 80
