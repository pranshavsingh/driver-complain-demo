FROM node:22-slim

# Install Python 3 + pip for faster-whisper transcription
RUN apt-get update && \
    apt-get install -y --no-install-recommends python3 python3-pip python3-venv && \
    rm -rf /var/lib/apt/lists/*

# Install faster-whisper (free, local speech-to-text)
RUN pip3 install --break-system-packages faster-whisper

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

# Copy workspace root files needed for pnpm
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./

# Copy the shared packages
COPY packages/ ./packages/

# Copy the API app
COPY apps/api/ ./apps/api/

# Install dependencies
RUN pnpm install --frozen-lockfile --filter @driver-complaint/api...

# Generate Prisma client
RUN cd apps/api && pnpm prisma generate

EXPOSE 4000

WORKDIR /app/apps/api

CMD ["node", "--import", "tsx", "--import", "./src/instrument.ts", "src/index.ts"]
