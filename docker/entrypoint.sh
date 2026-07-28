#!/bin/sh
set -eu

cd /app/backend

# Production: set up persistent storage symlinks
if [ -n "${PERSISTENT_DATA_DIR:-}" ]; then
  DATA_DIR="$PERSISTENT_DATA_DIR"
  mkdir -p "$DATA_DIR/models" "$DATA_DIR/recordings" "$DATA_DIR/chat_audio" "$DATA_DIR/animations"
  # Replace runtime-writable asset dirs with symlinks to persistent storage
  rm -rf assets/models && ln -sfn "$DATA_DIR/models" assets/models
  rm -rf assets/recordings && ln -sfn "$DATA_DIR/recordings" assets/recordings
  rm -rf assets/chat_audio && ln -sfn "$DATA_DIR/chat_audio" assets/chat_audio
  rm -rf assets/animations && ln -sfn "$DATA_DIR/animations" assets/animations
fi

alembic upgrade head

exec uvicorn app.main:app --host 0.0.0.0 --port 8788
