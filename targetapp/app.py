from flask import Flask, request, Response
import os
import random
import string
import time
from prometheus_client import Counter, Histogram, generate_latest, CONTENT_TYPE_LATEST

app = Flask(__name__)

# === Prometheus Metrics ===
REQUEST_COUNT = Counter('app_request_count', 'Total Request Count', ['method', 'endpoint'])
REQUEST_LATENCY = Histogram('app_request_latency_seconds', 'Request latency', ['endpoint'])

# CPU Intensive Function
def fibonacci(n):
    if n <= 1:
        return n
    return fibonacci(n - 1) + fibonacci(n - 2)

@app.route('/cpu-intensive', methods=['GET'])
def cpu_intensive():
    start_time = time.time()
    n = int(request.args.get('n', 40))
    with REQUEST_LATENCY.labels('/cpu-intensive').time():
        result = fibonacci(n)
    elapsed_time = time.time() - start_time
    REQUEST_COUNT.labels(method='GET', endpoint='/cpu-intensive').inc()
    return {"input": n, "result": result, "time_taken": elapsed_time}

@app.route('/memory-intensive', methods=['GET'])
def memory_intensive():
    size = int(request.args.get('size', 5))
    with REQUEST_LATENCY.labels('/memory-intensive').time():
        memory_hog = [''.join(random.choices(string.ascii_letters, k=1024)) for _ in range(size * 1024)]
    REQUEST_COUNT.labels(method='GET', endpoint='/memory-intensive').inc()
    return {"message": f"Allocated ~{size}MB in memory"}

@app.route('/io-intensive', methods=['GET'])
def io_intensive():
    size_mb = int(request.args.get('size', 1))
    size_bytes = size_mb * 1024 * 1024
    file_path = "/tmp/io_test_file"

    with REQUEST_LATENCY.labels('/io-intensive').time():
        with open(file_path, "wb") as f:
            f.write(os.urandom(size_bytes))
        with open(file_path, "rb") as f:
            _ = f.read()
        os.remove(file_path)
        
    REQUEST_COUNT.labels(method='GET', endpoint='/io-intensive').inc()
    return {"message": f"Successfully wrote and read {size_mb}MB"}

# === Metrics Endpoint ===
@app.route('/metrics')
def metrics():
    return Response(generate_latest(), mimetype=CONTENT_TYPE_LATEST)

if __name__ == '__main__':
    app.run(host="0.0.0.0", port=5000)
