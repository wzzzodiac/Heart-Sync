FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY tsconfig*.json ./
COPY server ./server
COPY shared ./shared
COPY questions ./questions
COPY scripts ./scripts
RUN npm run validate:questions && npx tsc -p tsconfig.server.json

FROM node:24-bookworm-slim
ENV NODE_ENV=production PORT=8080
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
COPY --from=build /app/questions ./questions
USER node
EXPOSE 8080
CMD ["node", "dist/server/index.js"]
