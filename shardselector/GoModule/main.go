package main

import (
	"encoding/json"
	"fmt"
	"io/ioutil"
	"log"
	"net/http"
	"os"
	"strconv"
	"sync"
	"time"
)

type Shard struct {
	Name        string
	CPUUsage    float64
	MemoryUsage float64
	IOUsage     float64
}

type RequestType struct {
	CPU    float64
	Memory float64
	IO     float64
}

type PrometheusResponse struct {
	Status string `json:"status"`
	Data   struct {
		Result []struct {
			Metric map[string]string `json:"metric"`
			Value  []interface{}     `json:"value"`
		} `json:"result"`
	} `json:"data"`
}

var (
	requestTypes = map[string]RequestType{
		"analytics":        {1.5, 0.8, 0.5},
		"simple_read":      {0.5, 0.3, 1.2},
		"image_processing": {1.8, 1.5, 0.7},
	}
	weights = struct {
		CPU    float64
		Memory float64
		IO     float64
	}{0.4, 0.3, 0.3}

	mutex           sync.Mutex
	cacheMutex      sync.RWMutex
	cachedShardData map[string]interface{}
	updateInterval  time.Duration

	maxCPU    float64
	maxMemory float64
	maxIO     float64
)

func init() {
	maxCPU = getEnvAsFloat("MAX_CPU", 2.0)
	maxMemory = getEnvAsFloat("MAX_MEMORY", 2*1024*1024*1024) // 2GB
	maxIO = getEnvAsFloat("MAX_IO", 500*1024*1024)            // 500MB
}

func getEnvAsFloat(key string, defaultVal float64) float64 {
	valStr := os.Getenv(key)
	if valStr == "" {
		return defaultVal
	}
	val, err := strconv.ParseFloat(valStr, 64)
	if err != nil {
		log.Printf("Invalid value for %s, using default %.2f\n", key, defaultVal)
		return defaultVal
	}
	return val
}

func fetchMetric(baseURL string, query string) map[string]float64 {
	client := &http.Client{Timeout: 10 * time.Second}
	reqURL := fmt.Sprintf("%s/api/v1/query", baseURL)
	req, _ := http.NewRequest("GET", reqURL, nil)

	qParams := req.URL.Query()
	qParams.Add("query", query)
	req.URL.RawQuery = qParams.Encode()

	req.Header.Set("Authorization", "Basic YWRtaW46cHJvbS1vcGVyYXRvcg==")
	log.Println("[FetchMetric] URL:", req.URL.String())

	resp, err := client.Do(req)
	if err != nil {
		log.Println("Error fetching:", err)
		return nil
	}
	defer resp.Body.Close()

	body, _ := ioutil.ReadAll(resp.Body)

	if resp.StatusCode != 200 {
		log.Printf("Failed Request! Status: %s | Response: %s\n", resp.Status, string(body))
		return nil
	}

	var promResp PrometheusResponse
		
	err = json.Unmarshal(body, &promResp)
	if err != nil {
		log.Println("Error unmarshaling response:", err)
		return nil
	}

	result := make(map[string]float64)
	for _, item := range promResp.Data.Result {
		pod := item.Metric["pod"]
		valueStr := item.Value[1].(string)
		value, _ := strconv.ParseFloat(valueStr, 64)
		result[pod] = value
		log.Printf("[Metric] Pod: %s | Value: %.18f\n", pod, value)
	}
	return result
}

func buildShards() []Shard {
	cpuMetrics := fetchMetric("http://localhost:91", `sum by (pod) (rate(container_cpu_usage_seconds_total{pod=~"flask-app.*", namespace="default", container!="POD"}[1m]))`)
	memMetrics := fetchMetric("http://localhost:91", `sum by (pod) (container_memory_usage_bytes{pod=~"flask-app.*", namespace="default"})`)
	ioMetrics := fetchMetric("http://localhost:91", `sum by (pod) (container_fs_reads_bytes_total{pod=~"flask-app.*", namespace="default"})`)

	shards := []Shard{}
	uniquePods := map[string]bool{}
	for pod := range cpuMetrics {
		uniquePods[pod] = true
	}
	for pod := range memMetrics {
		uniquePods[pod] = true
	}
	for pod := range ioMetrics {
		uniquePods[pod] = true
	}

	for pod := range uniquePods {
		shards = append(shards, Shard{
			Name:        pod,
			CPUUsage:    cpuMetrics[pod],
			MemoryUsage: memMetrics[pod],
			IOUsage:     ioMetrics[pod],
		})
	}
	return shards
}

func getShardScore(shard Shard, demand RequestType) float64 {
	normalizedCPU := min(shard.CPUUsage/maxCPU, 1)
	normalizedMemory := min(shard.MemoryUsage/maxMemory, 1)
	normalizedIO := min(shard.IOUsage/maxIO, 1)

	return weights.CPU*normalizedCPU*demand.CPU +
		weights.Memory*normalizedMemory*demand.Memory +
		weights.IO*normalizedIO*demand.IO
}

func min(a, b float64) float64 {
	if a < b {
		return a
	}
	return b
}

func updateShardSelection() {
	mutex.Lock()
	shards := buildShards()
	mutex.Unlock()

	for reqType, demand := range requestTypes {
		shardDetails := []map[string]interface{}{}
		var bestShard Shard
		bestScore := -1.0

		for _, shard := range shards {
			score := getShardScore(shard, demand)
			detail := map[string]interface{}{
				"name":         shard.Name,
				"cpu_usage":    shard.CPUUsage,
				"memory_usage": shard.MemoryUsage,
				"io_usage":     shard.IOUsage,
				"score":        score,
			}
			shardDetails = append(shardDetails, detail)

			if bestScore == -1 || score < bestScore {
				bestShard = shard
				bestScore = score
			}
		}

		cacheMutex.Lock()
		cachedShardData[reqType] = map[string]interface{}{
			"selected_shard": bestShard.Name,
			"selected_metrics": map[string]interface{}{
				"cpu_usage":    bestShard.CPUUsage,
				"memory_usage": bestShard.MemoryUsage,
				"io_usage":     bestShard.IOUsage,
				"score":        bestScore,
			},
			"all_shards":   shardDetails,
			"last_updated": time.Now().Format(time.RFC3339),
		}
		cacheMutex.Unlock()
	}
	log.Println("[Updater] Shard selection cache updated.")
}

func startShardUpdater() {
	intervalStr := os.Getenv("UPDATE_INTERVAL_SECONDS")
	if intervalStr == "" {
		intervalStr = "30"
	}
	interval, err := strconv.Atoi(intervalStr)
	if err != nil || interval <= 0 {
		interval = 30
	}
	updateInterval = time.Duration(interval) * time.Second

	go func() {
		for {
			updateShardSelection()
			time.Sleep(updateInterval)
		}
	}()
	log.Printf("[Init] Shard updater started with interval: %v seconds\n", interval)
}

func shardHandler(w http.ResponseWriter, r *http.Request) {
	query := r.URL.Query().Get("type")
	if query == "" {
		http.Error(w, "Missing 'type' parameter", http.StatusBadRequest)
		return
	}

	cacheMutex.RLock()
	data, exists := cachedShardData[query]
	cacheMutex.RUnlock()

	if !exists {
		http.Error(w, "No cached data for this request type", http.StatusNotFound)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(data)
}

func main() {
	cachedShardData = make(map[string]interface{})
	startShardUpdater()

	http.HandleFunc("/select_shard", shardHandler)
	fmt.Printf("Shard selection service running on port 8080...\n")
	fmt.Printf("Config - MAX_CPU: %.2f cores, MAX_MEMORY: %.0f bytes, MAX_IO: %.0f bytes\n", maxCPU, maxMemory, maxIO)
	log.Fatal(http.ListenAndServe(":8080", nil))
}
