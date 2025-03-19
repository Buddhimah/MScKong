from locust import HttpUser, task, between

class LoadTest(HttpUser):
    wait_time = between(1, 3)  # Simulates realistic user behavior with wait times

    @task(1)
    def test_cpu_intensive(self):
        """Load test the CPU-intensive Fibonacci endpoint"""
        self.client.get("/cpu-intensive?n=35")  # Change `n` as needed

    @task(1)
    def test_memory_intensive(self):
        """Load test the Memory-intensive endpoint"""
        self.client.get("/memory-intensive?size=10")  # Change size in MB as needed

    @task(1)
    def test_io_intensive(self):
        """Load test the IO-intensive endpoint"""
        self.client.get("/io-intensive?size=5")  # Change size in MB as needed

#locust -f locustfile.py --host http://127.0.0.1:5000
