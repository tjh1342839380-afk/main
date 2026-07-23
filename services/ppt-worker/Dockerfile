FROM python:3.12-slim AS ppt-master-source

ARG PPT_MASTER_COMMIT=cad57e4a45d8664bf4830d85711d355dc2600455

RUN apt-get update \
    && apt-get install -y --no-install-recommends git ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && git init /opt/ppt-master \
    && git -C /opt/ppt-master remote add origin https://github.com/hugohe3/ppt-master.git \
    && git -C /opt/ppt-master fetch --depth 1 origin "${PPT_MASTER_COMMIT}" \
    && git -C /opt/ppt-master checkout --detach FETCH_HEAD \
    && test "$(git -C /opt/ppt-master rev-parse HEAD)" = "${PPT_MASTER_COMMIT}" \
    && rm -rf /opt/ppt-master/.git

FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PPT_MASTER_ROOT=/opt/ppt-master \
    PORT=8080

WORKDIR /app

COPY --from=ppt-master-source /opt/ppt-master /opt/ppt-master
COPY requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt
COPY app.py ./app.py
COPY PPT_MASTER_LICENSE ./PPT_MASTER_LICENSE

EXPOSE 8080

CMD ["gunicorn", "--bind", "0.0.0.0:8080", "--workers", "2", "--threads", "2", "--timeout", "180", "app:app"]
