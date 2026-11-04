FROM python:3.12-slim

WORKDIR /app

# System deps for headless Chromium (patchright/Camoufox)
RUN apt-get update && apt-get install -y --no-install-recommends \
    libx11-6 libxcomposite1 libxdamage1 libxrandr2 libxkbcommon0 \
    libgtk-3-0 libasound2 libnss3 libnspr4 libdbus-1-3 libatk1.0-0 \
    libatk-bridge2.0-0 libcups2 libdrm2 libxcb1 libxfixes3 libxext6 \
    libxi6 libxrender1 libxtst6 libgbm1 libpango-1.0-0 libpangocairo-1.0-0 \
    libcairo2 libgdk-pixbuf-2.0-0 libglib2.0-0 fonts-liberation ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Download the headless Chromium the stealth fetcher launches
RUN python -m patchright install chromium

COPY service.py /app/service.py

EXPOSE 8410
CMD ["python", "/app/service.py"]
