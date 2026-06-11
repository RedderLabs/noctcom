FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json .npmrc ./
RUN npm ci \
 && cp node_modules/libsodium-sumo/dist/modules-sumo-esm/libsodium-sumo.mjs \
       node_modules/libsodium-wrappers-sumo/dist/modules-sumo-esm/libsodium-sumo.mjs

FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ARG NEXT_PUBLIC_API_URL=https://api.noctcom.com
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
# Config web de Firebase (FCM): pública por diseño — identifica el proyecto, no
# autentica nada (la seguridad está en el service account del backend). Los
# mismos valores ya viven en public/firebase-messaging-sw.js.
ENV NEXT_PUBLIC_FIREBASE_API_KEY=AIzaSyDbc7sCk1Z3cHrcVUsYjDM2EGwBL-KSUBM
ENV NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=noctcom-6116b.firebaseapp.com
ENV NEXT_PUBLIC_FIREBASE_PROJECT_ID=noctcom-6116b
ENV NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=noctcom-6116b.firebasestorage.app
ENV NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=2207334954
ENV NEXT_PUBLIC_FIREBASE_APP_ID=1:2207334954:web:594da6aa8bb2636ab6b953
ENV NEXT_PUBLIC_FIREBASE_VAPID_KEY=BM9vrhjjcOxpfPsXpfNhRI6ngQt35f3xvUPG2t2c_Kf2M9GNL4SJdksw2v4yKWJyC8B8uhSLY3MCjyqHOndRZVE
# Error tracking (GlitchTip). OPT-IN: el DSN llega como build-arg y por defecto
# va VACIO, asi una instancia self-host NO reporta telemetria a nadie
# (zero-knowledge tambien aqui). La nube pasa su DSN via docker-compose
# (NEXT_PUBLIC_SENTRY_DSN en el .env de prod). NEXT_PUBLIC_* se hornea en build.
ARG NEXT_PUBLIC_SENTRY_DSN=
ENV NEXT_PUBLIC_SENTRY_DSN=$NEXT_PUBLIC_SENTRY_DSN
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
RUN addgroup -S app && adduser -S app -G app

COPY --from=build /app/public ./public
COPY --from=build --chown=app:app /app/.next/standalone ./
COPY --from=build --chown=app:app /app/.next/static ./.next/static

USER app
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
CMD ["node", "server.js"]
