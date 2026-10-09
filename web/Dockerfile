# Static site: build with Node, serve with nginx (with cross-origin isolation headers).
FROM node:22-alpine AS build
WORKDIR /repo/web
COPY web/package.json web/package-lock.json ./
RUN npm ci
COPY shared/ /repo/shared/
COPY web/ ./
ARG VITE_BASE=/
ARG VITE_REPO_URL=
RUN VITE_BASE=$VITE_BASE VITE_REPO_URL=$VITE_REPO_URL npm run build

FROM nginx:1.27-alpine
COPY web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /repo/web/dist /usr/share/nginx/html
