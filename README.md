# Oink Oink Lost - Game

An AI-powered storybook adventure game where a little lost Piglet explore and interact with dynamically generated world and NPCs to get clues and find Mama.

Play online at [oinkoink.fun](https://oinkoink.fun).

## One-command local install

You need Docker, an OpenAI API key, and a Sarvam AI API key. The installer supports macOS and Linux on Intel/AMD and ARM machines.

To install without cloning the repository, use the public installer:

```bash
curl -fsSL https://raw.githubusercontent.com/saumitras/oinkoink/main/install.sh | bash
```

Or pass the key non-interactively:

```bash
curl -fsSL https://raw.githubusercontent.com/saumitras/oinkoink/main/install.sh \
  | OPENAI_API_KEY=sk-your-key SARVAM_API_KEY=your-sarvam-key bash
```

The installer securely prompts for both API keys, pulls the latest
`saumitras/oinkoink` Docker image, and starts the game at
[http://localhost:5173](http://localhost:5173).

## Run from this repository

From the repository root, run:

```bash
./install.sh
```

For a non-interactive install:

```bash
OPENAI_API_KEY=sk-your-key SARVAM_API_KEY=your-sarvam-key ./install.sh
```

Do not commit API keys or add them to the repository. The installer uses a
temporary environment file and removes it after starting the container.

Optional settings:

```bash
OINKOINK_PORT=8080          # local port, default 5173
OINKOINK_BIND=0.0.0.0       # allow other devices to connect, default 127.0.0.1
OINKOINK_IMAGE=user/tag     # alternate image, default saumitras/oinkoink:latest
```

Place settings before the command. For example:

```bash
OPENAI_API_KEY=sk-your-key SARVAM_API_KEY=your-sarvam-key OINKOINK_PORT=8080 ./install.sh
```

Rerun the same installer command at any time to pull the newest image and
replace the app container without deleting saved adventures.

Generated adventures are retained in the `oinkoink-data` Docker volume when the app is upgraded or restarted.

```bash
docker logs -f oinkoink     # logs
docker stop oinkoink        # stop
docker start oinkoink       # start again
docker rm -f oinkoink       # uninstall the container
docker volume rm oinkoink-data  # also delete generated adventures
```

The API keys are passed only to the local container. Like other Docker environment variables, they are visible to users who have administrative access to the local Docker daemon.

## Sarvam multilingual services used

| Purpose | Model | Sarvam service |
| --- | --- | --- |
| Compact multilingual adventure plans | `sarvam-105b` | Chat Completions with tool calling |
| Live multilingual NPC conversations | `sarvam-30b` | Chat Completions with tool calling |
| UI and reusable-adventure translation | `sarvam-translate:v1` | Text Translation API |
| Narrator, NPC, and Piglet voices | `bulbul:v3` | Text-to-Speech API |
| Microphone speech recognition | `saaras:v3` | Speech-to-Text API |

The interface and story support English, Hindi, Kannada, Tamil, Telugu, Bengali,
Marathi, Gujarati, Punjabi, Malayalam, and Odia. OpenAI remains responsible for
visual generation, vision-based map annotation, and prompt moderation.

## OpenAI services retained

| Purpose | Model | OpenAI service |
| --- | --- | --- |
| Hub hotspot detection and room annotation | `gpt-5.4-mini-2026-03-17` | Responses API with image input |
| Hub, room, character, outline, and reunion images | `gpt-image-2` | Images API (generation and editing) |
| Adventure prompt screening | `omni-moderation-latest` | Moderations API |

Images are generated as medium-quality 1024 x 1024 PNG files. Model defaults
can be overridden with environment variables; see `.env.example`.

## Build the distributable image

```bash
docker build -t oinkoink:local .
docker run --rm -p 5173:8000 \
  -e OPENAI_API_KEY=sk-your-key \
  -e SARVAM_API_KEY=your-sarvam-key \
  -v oinkoink-data:/app/local-assets \
  oinkoink:local
```

The root `Dockerfile` builds the React frontend and packages it with the FastAPI server in one non-root runtime image. Existing `Dockerfile.client`, `Dockerfile.server`, and Compose files remain available for development and hosted deployment.

## Publishing to Docker Hub

The public repository workflow publishes multi-platform `linux/amd64` and `linux/arm64` images when a `v*` tag is pushed or the workflow is run manually. Configure these repository secrets first:

- `DOCKERHUB_USERNAME`
- `DOCKERHUB_TOKEN`

The workflow is guarded so it runs only in `saumitras/oinkoink`, not in the private development repository.
