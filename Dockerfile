FROM node:20-slim

COPY package.json /app/package.json
RUN cd /app && npm install --omit=dev

COPY server.js /app/server.js
COPY public /app/public

WORKDIR /app
EXPOSE 8008

ENTRYPOINT ["node", "/app/server.js"]
