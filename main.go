package sharding

import (
	"encoding/json"
	"fmt"
	"log"
	"math/rand"
	"net/http"
	"sync"
	"time"
)

type Shard struct {
	Name         string  `json:"name"`
	CPUUsage     float64 `json:"cpu_usage"`
	MemoryUsage  float64 `json:"memory_usage"`
	IOUsage      float64 `json:"io_usage"`
	NetworkRTT   float64 `json:"network_rtt"`
	QueueLength  float64 `json:"queue_length"`
}

type RequestType struct {
	CPU   float64
	Memory float64
	IO    float64
}

var (
	shards = []Shard{
		{"S1", 50, 70, 30, 15, 3},
		{"S2", 20, 50, 80, 10, 1},
		{"S3", 80, 60, 40, 25, 5},
	}
	requestTypes = map[string]RequestType{
		"analytics":        {1.5, 0.8, 0.5},
		"simple_read":      {0.5, 0.3, 1.2},
		"image_processing": {1.8, 1.5, 0.7},
	}
	weights = struct {
		CPU    float64
		Memory float64
		IO     float64
		Network float64
		Queue  float64
	}{0.4, 0.3, 0.2, 0.1, 0.2}
	mutex sync.Mutex
)

func updateShardUsage() {
	mutex.Lock()
	defer mutex.Unlock()
	for i := range shards {
		shards[i].CPUUsage = rand.Float64() * 100
		shards[i].MemoryUsage = rand.Float64() * 100
		shards[i].IOUsage = rand.Float64() * 100
		shards[i].NetworkRTT = rand.Float64() * 50
		shards[i].QueueLength = rand.Float64() * 10
	}
}

func getShardScore(shard Shard, demand RequestType) float64 {
	cpuScore := weights.CPU * (shard.CPUUsage / 100) * demand.CPU
	memScore := weights.Memory * (shard.MemoryUsage / 100) * demand.Memory
	ioScore := weights.IO * (shard.IOUsage / 100) * demand.IO
	netScore := weights.Network * (shard.NetworkRTT / 50)  // Normalize by max 50ms
	queueScore := weights.Queue * (shard.QueueLength / 10) // Normalize by max queue length 10

	return cpuScore + memScore + ioScore + netScore + queueScore
}

func getBestShard(requestType string) (Shard, float64) {
	demand, exists := requestTypes[requestType]
	if !exists {
		return Shard{}, -1
	}

	bestShard := shards[0]
	bestScore := getShardScore(bestShard, demand)

	for _, shard := range shards[1:] {
		currentScore := getShardScore(shard, demand)
		if currentScore < bestScore {
			bestShard = shard
			bestScore = currentScore
		}
	}

	return bestShard, bestScore
}

func shardHandler(w http.ResponseWriter, r *http.Request) {
	query := r.URL.Query().Get("type")
	if query == "" {
		http.Error(w, "Missing 'type' parameter", http.StatusBadRequest)
		return
	}

	updateShardUsage() // Dynamically update shard resource usage

	mutex.Lock()
	bestShard, score := getBestShard(query)
	mutex.Unlock()

	if score == -1 {
		http.Error(w, "Invalid request type", http.StatusBadRequest)
		return
	}

	response := map[string]interface{}{
		"selected_shard": bestShard.Name,
		"cpu_usage":      bestShard.CPUUsage,
		"memory_usage":   bestShard.MemoryUsage,
		"io_usage":       bestShard.IOUsage,
		"network_rtt":    bestShard.NetworkRTT,
		"queue_length":   bestShard.QueueLength,
		"score":          score,
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}

func main() {
	rand.Seed(time.Now().UnixNano())

	http.HandleFunc("/select_shard", shardHandler)
	fmt.Println("Shard selection service running on port 8080...")
	log.Fatal(http.ListenAndServe(":8080", nil))
}
