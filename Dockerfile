FROM node:22-slim AS frontend-build

WORKDIR /build

COPY package*.json ./
RUN npm ci

COPY index.html vite.config.ts tsconfig.json ./
COPY public/ ./public/
COPY src/client/ ./src/client/
COPY src/shared/ ./src/shared/
RUN npm run build


FROM python:3.12-slim AS runtime

LABEL org.opencontainers.image.title="Oink Oink Lost" \
      org.opencontainers.image.description="An AI-powered storybook adventure game" \
      org.opencontainers.image.source="https://github.com/saumitras/oinkoink"

ENV PYTHONUNBUFFERED=1 \
    PORT=8000 \
    ASSETS_DIR=/app/local-assets \
    STATIC_DIR=/app/dist \
    DEV_CACHE=false

WORKDIR /app

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt \
    && useradd --create-home --uid 10001 --shell /usr/sbin/nologin oinkoink \
    && mkdir -p /app/local-assets \
    && chown -R oinkoink:oinkoink /app/local-assets

COPY --chown=oinkoink:oinkoink server/ ./server/
COPY --chown=oinkoink:oinkoink preset-assets/ ./preset-assets/
COPY --from=frontend-build --chown=oinkoink:oinkoink /build/dist ./dist/

USER oinkoink

VOLUME ["/app/local-assets"]
EXPOSE 8000

HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=5 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/healthz', timeout=3)"

CMD ["python", "-m", "uvicorn", "server.main:app", "--host", "0.0.0.0", "--port", "8000"]
