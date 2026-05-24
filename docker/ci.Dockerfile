FROM node:24-slim

# Install system dependencies for validation
RUN apt-get update && apt-get install -y \
    libxml2-utils \
    default-jre \
    git \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
