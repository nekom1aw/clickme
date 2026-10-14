FROM node:24-bookworm-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force
COPY lib ./lib
COPY docker/worker ./docker/worker
ENV NODE_ENV=production
USER node
CMD ["node", "--disable-warning=ExperimentalWarning", "--import", "./docker/worker/typescript-loader.mjs", "./docker/worker/main.mjs"]
