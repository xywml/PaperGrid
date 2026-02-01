#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VERSION="$(node -p "require('${ROOT_DIR}/package.json').version")"

if [[ -z "${VERSION}" ]]; then
  echo "未能读取应用版本号" >&2
  exit 1
fi

IMAGE="${IMAGE:-ghcr.io/xywml/papergrid}"
TAG_VERSION="${VERSION}"
if [[ "${TAG_VERSION}" != v* ]]; then
  TAG_VERSION="v${TAG_VERSION}"
fi

echo "使用版本: ${TAG_VERSION}"
docker build \
  --build-arg APP_VERSION="${VERSION}" \
  -t "${IMAGE}:${TAG_VERSION}" \
  -t "${IMAGE}:latest" \
  "${ROOT_DIR}"
