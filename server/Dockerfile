FROM python:3.11

WORKDIR /app
COPY requirements.txt ./
RUN pip install -r requirements.txt --no-cache-dir

COPY main.py ./
EXPOSE 8000
CMD ["sh","-c","uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000} --workers 1"]

