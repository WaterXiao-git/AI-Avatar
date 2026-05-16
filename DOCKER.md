# Docker Start Guide

This project can be started with Docker on Windows, macOS, or Linux as long as the machine has:

- Docker Desktop or Docker Engine
- Access to the API keys configured in `backend/.env`

## What this Docker setup does

- Reuses the prepared React build in `frontend/dist`
- Starts the FastAPI backend on port `8788`
- Serves the frontend from the same backend container
- Persists database and generated data through Docker volumes

## First-time setup

1. Copy the backend environment template if needed:

```bash
cd backend
cp .env.example .env
```

2. Fill in the required API keys in `backend/.env`.

3. Make sure the frontend production build already exists:

```bash
cd frontend
npm install
npm run build
```

## Start the service

Run from the project root:

```bash
docker compose up --build
```

After startup, open:

```text
http://localhost:8788
```

## Start in background

```bash
docker compose up --build -d
```

## Stop the service

```bash
docker compose down
```

## Remove persisted data

```bash
docker compose down -v
```

## Notes

- The app is exposed on port `8788`.
- Browser microphone and camera permissions are still controlled by the host OS and browser.
- Real-time audio, uploads, and model generation still depend on the environment variables configured in `backend/.env`.
- This Docker setup is a good cross-machine and cross-OS deployment baseline, and it is also useful groundwork for a later fully independent installer package.
