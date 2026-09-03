FROM node:22-bookworm-slim

ENV CI=true COREPACK_HOME=/tmp/corepack LANG=C.UTF-8 LC_ALL=C.UTF-8

RUN apt-get update \
  && apt-get install -y --no-install-recommends git \
  && rm -rf /var/lib/apt/lists/* \
  && corepack enable \
  && mkdir -p /workspace/.pnpm-store /workspace/node_modules /workspace/packages/roller/node_modules \
  && chmod 0777 /workspace/.pnpm-store /workspace/node_modules /workspace/packages/roller/node_modules

WORKDIR /workspace

CMD ["sh", "-c", "pnpm install --frozen-lockfile && pnpm gate"]
