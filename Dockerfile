FROM python:3.11-slim

# Set working directory
WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements first for better caching
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application files
COPY anki_vocab.py .
COPY entrypoint.sh .

# Make scripts executable
RUN chmod +x anki_vocab.py entrypoint.sh

# Create non-root user
RUN useradd -m -u 1000 vocabuser && chown -R vocabuser:vocabuser /app
USER vocabuser

# Set environment variables
ENV PYTHONUNBUFFERED=1
ENV ANKI_HOST=host.docker.internal

ENTRYPOINT ["/app/entrypoint.sh"]