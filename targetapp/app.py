from flask import Flask, request
import os
import random
import string
import time

app = Flask(__name__)

# CPU Intensive Function: Recursive Fibonacci
def fibonacci(n):
    if n <= 1:
        return n
    return fibonacci(n - 1) + fibonacci(n - 2)

@app.route('/cpu-intensive', methods=['GET'])
def cpu_intensive():
    n = int(request.args.get('n', 40))  # Default Fibonacci 40
    start_time = time.time()
    result = fibonacci(n)
    elapsed_time = time.time() - start_time
    return {"input": n, "result": result, "time_taken": elapsed_time}

# Memory Intensive Function: Generate Large List of Random Strings
@app.route('/memory-intensive', methods=['GET'])
def memory_intensive():
    size = int(request.args.get('size', 5))  # Default size = 500MB
    memory_hog = [''.join(random.choices(string.ascii_letters, k=1024)) for _ in range(size * 1024)]
    return {"message": f"Allocated ~{size}MB in memory"}

# I/O Intensive Function: Write and Read a Large File
@app.route('/io-intensive', methods=['GET'])
def io_intensive():
    size_mb = int(request.args.get('size', 1))  # Default 100MB
    size_bytes = size_mb * 1024 * 1024
    file_path = "/tmp/io_test_file"

    # Write large data to file
    with open(file_path, "wb") as f:
        f.write(os.urandom(size_bytes))

    # Read the file
    with open(file_path, "rb") as f:
        _ = f.read()

    os.remove(file_path)  # Clean up
    return {"message": f"Successfully wrote and read {size_mb}MB"}

if __name__ == '__main__':
    app.run(host="0.0.0.0", port=5000)
