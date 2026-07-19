# Oink Oink Lost

An AI-powered storybook adventure where a little lost Piglet follows three friendly clues to find Mama.

## One-command local install

You need Docker and an OpenAI API key. The installer supports macOS and Linux on Intel/AMD and ARM machines.

```bash
curl -fsSL https://raw.githubusercontent.com/saumitras/oinkoink/main/install.sh | bash
```

The installer securely prompts for the key and starts the game at [http://localhost:5173](http://localhost:5173).

For a non-interactive install:

```bash
curl -fsSL https://raw.githubusercontent.com/saumitras/oinkoink/main/install.sh \
  | OPENAI_API_KEY=sk-your-key bash
```

Optional settings:

```bash
OINKOINK_PORT=8080          # local port, default 5173
OINKOINK_BIND=0.0.0.0       # allow other devices to connect, default 127.0.0.1
OINKOINK_IMAGE=user/tag     # alternate image, default saumitras/oinkoink:latest
```

Generated adventures are retained in the `oinkoink-data` Docker volume when the app is upgraded or restarted.

```bash
docker logs -f oinkoink     # logs
docker stop oinkoink        # stop
docker start oinkoink       # start again
docker rm -f oinkoink       # uninstall the container
docker volume rm oinkoink-data  # also delete generated adventures
```

The API key is passed only to the local container. Like other Docker environment variables, it is visible to users who have administrative access to the local Docker daemon.

## Build the distributable image

```bash
docker build -t oinkoink:local .
docker run --rm -p 5173:8000 \
  -e OPENAI_API_KEY=sk-your-key \
  -v oinkoink-data:/app/local-assets \
  oinkoink:local
```

The root `Dockerfile` builds the React frontend and packages it with the FastAPI server in one non-root runtime image. Existing `Dockerfile.client`, `Dockerfile.server`, and Compose files remain available for development and hosted deployment.

## Publishing to Docker Hub

The public repository workflow publishes multi-platform `linux/amd64` and `linux/arm64` images when a `v*` tag is pushed or the workflow is run manually. Configure these repository secrets first:

- `DOCKERHUB_USERNAME`
- `DOCKERHUB_TOKEN`

The workflow is guarded so it runs only in `saumitras/oinkoink`, not in the private development repository.
