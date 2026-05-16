FROM python:3.12-slim AS runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app/backend

RUN printf '%s\n' \
    'deb https://mirrors.aliyun.com/debian/ bookworm main contrib non-free non-free-firmware' \
    'deb https://mirrors.aliyun.com/debian/ bookworm-updates main contrib non-free non-free-firmware' \
    'deb https://mirrors.aliyun.com/debian-security bookworm-security main contrib non-free non-free-firmware' \
    > /etc/apt/sources.list \
    && apt-get -o Acquire::Retries=5 update \
    && apt-get -o Acquire::Retries=5 install -y --fix-missing --no-install-recommends ffmpeg curl \
    && rm -rf /var/lib/apt/lists/*

COPY backend/requirements.txt /tmp/requirements.txt
RUN pip install --upgrade pip \
    && pip install -r /tmp/requirements.txt

COPY backend/ /app/backend/
COPY frontend/public /app/frontend/public
COPY frontend/dist /app/frontend/dist
COPY docker/entrypoint.sh /entrypoint.sh

RUN chmod +x /entrypoint.sh

EXPOSE 8788

ENTRYPOINT ["/entrypoint.sh"]
