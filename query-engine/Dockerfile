FROM python:3.13-slim
WORKDIR /app
# Build context is the repo root (see docker-compose.yml) so libs/openscale
# can be installed alongside the service.
COPY query-engine/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY libs/openscale /app/libs/openscale
RUN pip install --no-cache-dir /app/libs/openscale
COPY query-engine/ .
EXPOSE 8090
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8090"]
