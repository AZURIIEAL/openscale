# Built with ./frontend as the context and ./gateway as the extra "gateway"
# context (see docker-compose.deploy.yml): stage one builds the React app,
# stage two is Caddy serving it and proxying everything else.
FROM node:24-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM caddy:2.10-alpine
COPY --from=gateway Caddyfile /etc/caddy/Caddyfile
COPY --from=gateway --chmod=755 entrypoint.sh /usr/local/bin/openscale-gateway
COPY --from=build /app/dist /srv
EXPOSE 80 443
ENTRYPOINT ["/usr/local/bin/openscale-gateway"]
