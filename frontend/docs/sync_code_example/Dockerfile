FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY sync_server.py .

ENV PORT=3000
ENV SYNC_API_TOKEN=your-secure-token

EXPOSE 3000

CMD ["python", "sync_server.py"]