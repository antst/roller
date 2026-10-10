#!/usr/bin/env bash
set -euo pipefail

docker build --tag roller-gate .
docker run --rm --user "$(id -u):$(id -g)" --env DSH_TEST_VERSION \
  --volume "$PWD:/workspace" --volume /workspace/.pnpm-store \
  --volume /workspace/node_modules --volume /workspace/packages/roller/node_modules roller-gate
