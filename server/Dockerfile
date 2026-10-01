FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && addgroup -S superior && adduser -S superior -G superior && mkdir /data && chown superior:superior /data
COPY src ./src
USER superior
ENV PORT=8080 HOST=0.0.0.0 RELAY_DATA_FILE=/data/relay.json
EXPOSE 8080
CMD ["node", "src/index.mjs"]
