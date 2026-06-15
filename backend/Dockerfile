FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json .npmrc ./
RUN apk add --no-cache python3 make g++ \
 && npm ci \
 && cp node_modules/libsodium-sumo/dist/modules-sumo-esm/libsodium-sumo.mjs \
       node_modules/libsodium-wrappers-sumo/dist/modules-sumo-esm/libsodium-sumo.mjs

FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY package.json tsconfig.json ./
COPY src ./src
RUN npx tsc -p tsconfig.json --noEmitOnError false

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
# Error tracking (GlitchTip, proyecto noctcom-api). DSN publico (solo permite
# enviar eventos); SENTRY_DSN del entorno de Render lo sobreescribe si hace falta.
ENV SENTRY_DSN=https://7a49671484a245eaa01c10b061601511@app.glitchtip.com/24347
RUN apk add --no-cache wget tini \
 && addgroup -S app && adduser -S app -G app \
 && mkdir -p /data && chown app:app /data
# /data: destino de los blobs cifrados en disco (self-host). Se crea aquí como
# app:app para que, al montar el named volume blob_data por PRIMERA vez, Docker
# inicialice el volumen con esa propiedad y el proceso (USER app) pueda escribir.
COPY --from=build /app/dist ./dist
COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
USER app
EXPOSE 3000
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "dist/server.js"]
