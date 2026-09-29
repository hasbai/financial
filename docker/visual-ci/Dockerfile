FROM --platform=linux/arm64 mcr.microsoft.com/playwright@sha256:a0f4498920a5dbac63196d9140ed738ef00470f27e2e74029abd8850b7bd5717

# Playwright 1.63.0 / Ubuntu Noble / ARM64. This image is consumed by digest.
ENV DEBIAN_FRONTEND=noninteractive LANG=C.UTF-8 TZ=UTC

RUN apt-get update \
    && apt-get install -y --no-install-recommends fonts-noto-cjk fonts-noto-color-emoji \
    && rm -rf /var/lib/apt/lists/* \
    && npm install --global pnpm@10.33.2 \
    && node --version \
    && pnpm --version \
    && fc-cache -f
