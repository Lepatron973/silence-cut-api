# syntax=docker/dockerfile:1

# Base stage - Install dependencies
FROM node:20.19.6-alpine3.21 AS base
RUN apk --no-cache add dumb-init ffmpeg
RUN mkdir -p /home/node/app && chown node:node /home/node/app
WORKDIR /home/node/app
USER node
RUN mkdir tmp

# Dependencies stage
FROM base AS dependencies
COPY --chown=node:node ./package*.json ./
RUN npm ci
COPY --chown=node:node . .

# Build stage
FROM dependencies AS build
RUN node ace build

# Production stage
FROM base AS production
ENV NODE_ENV=production
ENV PORT=$PORT
ENV HOST=0.0.0.0
COPY --chown=node:node ./package*.json ./
RUN npm ci --omit=dev
COPY --chown=node:node --from=build /home/node/app/build .

# Create video storage directory with proper permissions
USER root
RUN mkdir -p /tmp/videos && chown -R node:node /tmp/videos && chmod 777 /tmp/videos
USER node

EXPOSE $PORT
CMD [ "dumb-init", "node", "bin/server.js" ]
