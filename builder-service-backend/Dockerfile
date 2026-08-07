# The builder service runs as a container in the docker-compose phase; until then
# it runs on the host via `npm start`. git is the only binary the worker spawns.
FROM node:24-alpine

RUN apk add --no-cache git

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY src ./src

CMD ["node", "src/main.ts"]
