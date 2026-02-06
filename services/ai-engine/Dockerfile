FROM python:3.11-slim AS base

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# ==================================================
# Dependencies stage
# ==================================================
FROM base AS deps

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# ==================================================
# Development stage
# ==================================================
FROM deps AS dev

COPY . .

ENV PYTHONUNBUFFERED=1
ENV DEBUG=true
ENV LOG_FORMAT=console

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]

# ==================================================
# Production stage
# ==================================================
FROM deps AS production

COPY . .

ENV PYTHONUNBUFFERED=1
ENV DEBUG=false
ENV LOG_FORMAT=json

EXPOSE 8000

# Use multiple workers in production
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "4"]
