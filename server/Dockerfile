FROM python:3.11-slim

# 预装构建依赖（scipy等需要）
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential gfortran libatlas-base-dev liblapack-dev libblas-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt ./
RUN pip install -r requirements.txt --no-cache-dir

COPY main.py ./
EXPOSE 8000
CMD ["uvicorn","main:app","--host","0.0.0.0","--port","8000","--workers","1"]
