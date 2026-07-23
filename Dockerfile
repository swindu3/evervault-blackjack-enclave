FROM node:20-slim

COPY package.json package-lock.json /app/
RUN cd /app && npm ci --omit=dev

COPY server.js /app/server.js
COPY public /app/public

WORKDIR /app
EXPOSE 8008

ENTRYPOINT ["node", "/app/server.js"]
