
# Steps for Bootrap K8s

This is for my future reference


## Deployment

Start Docker Desktop 

Start WSL 

## Deploy Kong

helm repo add kong https://charts.konghq.com

helm repo update

helm install kong kong/ingress -n kong --create-namespace

helm ls -A

curl -v http://localhost


## Deploy Custom APP

Clone REPO 

Navigate to basic-implementation\helm\kong\templates\echo

```
kubectl apply -f .\deployment.yaml

kubectl apply -f .\ingress.yaml

kubectl apply -f .\service.yaml
```

curl -v http://localhost/echo

## Deploy Custom LUA logic 

### Create Config Map

Navigate to kong-plugin-myheader/ folder.
```
kubectl create configmap kong-plugin-myheader --from-file=myheader -n kong
```

### Enable Custom Plugins

Clone https://github.com/Kong/charts/blob/main/charts/ingress/values.yaml

Add following section to the values.yaml 


```yaml
gateway:
  plugins:
    configMaps:
    - name: kong-plugin-myheader
      pluginName: myheader
```
```
helm upgrade kong kong/ingress -n kong --values values.yaml
```

### Create  KongPlugin

Navigate to kong-plugin-myheader/ folder.
```
kubectl apply -f .\kongplugin.yaml
```

## TEST

Send a GET request using POSTMAN to http://localhost/echo check the response header for myheader

## Update Upstream 

```
local MyHeader = {}

MyHeader.PRIORITY = 1000
MyHeader.VERSION = "1.0.0"

-- Access Phase: Set upstream service
function MyHeader:access(conf)
    local service = kong.router.get_service()
    kong.log("################################ Upstream Host: ", service.host)
    kong.service.set_target("nginx-service.default.svc.cluster.local", 80)
    kong.service.request.set_path("/")  -- Keep the same path (or modify if needed)
end

-- Header Filter Phase: Set response header
function MyHeader:header_filter(conf)
    kong.log("################################# Setting response header")
    kong.response.set_header("buddhima123", conf.header_value)
end

return MyHeader
```

## Shard Selector Micro Service 

Go to PATH : MSCProject\MScKong\shardselector\GoModule

You can Build Docker file by 

```
docker build -t buddhima/uuid:v1.0.1 .
```

Deploy it using the deployment.yaml in MSCProject\MScKong\shardselector


## Application Micro Service 

Go to PATH: MScKong\targetapp

You can Build Docker file by 

```
 docker build -t flask-performance-app:v1.0.0 .
```

Deploy it using the deployment.yaml 

### TEST

```
http://localhost/flask-api/memory-intensive
```

```
http://localhost/flask-api/cpu-intensive
```

```
http://localhost/flask-api/io-intensive
```


## Perfoamce TEST tool 

Go to PATH: MScKong\perfscripts

Install Locust 

```
pip install locust
```

locust -f locustfile.py --host http://127.0.0.1:5000


## Promethues

```
kubectl get svc
```

```
kubectl port-forward svc/prometheus-operated 9090:9090
```

```
kubectl port-forward svc/prometheus-grafana 9090:80
```

https://chatgpt.com/c/67e954d1-8f94-800b-aaf7-a43ee46fa0d6
https://chatgpt.com/c/68026f3a-5474-800b-9965-c1e11cc22549


kubectl port-forward svc/prometheus-kube-prometheus-prometheus 91:9090

curl --location --globoff --request GET 'http://localhost:91/api/v1/query?query=sum%20by%20(pod)%20(rate(container_cpu_usage_seconds_total{pod%3D~%22flask-app.*%22%2C%20namespace%3D%22default%22%2C%20container!%3D%22POD%22}[1m]))' \
--header 'Content-Type: application/x-www-form-urlencoded' \
--header 'Authorization: Basic YWRtaW46cHJvbS1vcGVyYXRvcg==' \
--data-urlencode 'query=sum by (pod) (rate(container_cpu_usage_seconds_total{pod=~"flask-app.*", namespace="default", container!="POD"}[1m]))'

{
    "status": "success",
    "data": {
        "resultType": "vector",
        "result": [
            {
                "metric": {
                    "pod": "flask-app-7b9749d9bb-758vs"
                },
                "value": [
                    1745502576.841,
                    "0.00019452252623980713"
                ]
            },
            {
                "metric": {
                    "pod": "flask-app-7b9749d9bb-z5pgn"
                },
                "value": [
                    1745502576.841,
                    "0.00022259114248216318"
                ]
            }
        ]
    }
}


http://localhost:91/api/v1/query?query=container_memory_usage_bytes{pod=~"flask-app.*",namespace="default"}

{
    "status": "success",
    "data": {
        "resultType": "vector",
        "result": [
            {
                "metric": {
                    "__name__": "container_memory_usage_bytes",
                    "endpoint": "https-metrics",
                    "id": "/kubepods.slice/kubepods-burstable.slice/kubepods-burstable-pod6257da9c_1c66_4a50_bea3_dea45d630d06.slice",
                    "instance": "10.224.0.5:10250",
                    "job": "kubelet",
                    "metrics_path": "/metrics/cadvisor",
                    "namespace": "default",
                    "node": "aks-agentpool-86501056-vmss00000c",
                    "pod": "flask-app-7b9749d9bb-758vs",
                    "service": "prometheus-kube-prometheus-kubelet"
                },
                "value": [
                    1745502608.939,
                    "21774336"
                ]
            },
            {
                "metric": {
                    "__name__": "container_memory_usage_bytes",
                    "endpoint": "https-metrics",
                    "id": "/kubepods.slice/kubepods-burstable.slice/kubepods-burstable-pod6257da9c_1c66_4a50_bea3_dea45d630d06.slice/cri-containerd-44328e3d4e07428929603f873a0d2cfa2c3679eae53a7f5b33ce8f60a9c9f617.scope",
                    "image": "mcr.microsoft.com/oss/kubernetes/pause:3.6",
                    "instance": "10.224.0.5:10250",
                    "job": "kubelet",
                    "metrics_path": "/metrics/cadvisor",
                    "name": "44328e3d4e07428929603f873a0d2cfa2c3679eae53a7f5b33ce8f60a9c9f617",
                    "namespace": "default",
                    "node": "aks-agentpool-86501056-vmss00000c",
                    "pod": "flask-app-7b9749d9bb-758vs",
                    "service": "prometheus-kube-prometheus-kubelet"
                },
                "value": [
                    1745502608.939,
                    "225280"
                ]
            },
            {
                "metric": {
                    "__name__": "container_memory_usage_bytes",
                    "endpoint": "https-metrics",
                    "id": "/kubepods.slice/kubepods-burstable.slice/kubepods-burstable-podf0981aa9_9a0e_47cd_8162_08da9610fe2b.slice",
                    "instance": "10.224.0.5:10250",
                    "job": "kubelet",
                    "metrics_path": "/metrics/cadvisor",
                    "namespace": "default",
                    "node": "aks-agentpool-86501056-vmss00000c",
                    "pod": "flask-app-7b9749d9bb-z5pgn",
                    "service": "prometheus-kube-prometheus-kubelet"
                },
                "value": [
                    1745502608.939,
                    "21876736"
                ]
            },
            {
                "metric": {
                    "__name__": "container_memory_usage_bytes",
                    "endpoint": "https-metrics",
                    "id": "/kubepods.slice/kubepods-burstable.slice/kubepods-burstable-podf0981aa9_9a0e_47cd_8162_08da9610fe2b.slice/cri-containerd-23a4ae46b0ef351ed2610060a6aa075068b94f10a6969493e4e11a10f1dfeff2.scope",
                    "image": "mcr.microsoft.com/oss/kubernetes/pause:3.6",
                    "instance": "10.224.0.5:10250",
                    "job": "kubelet",
                    "metrics_path": "/metrics/cadvisor",
                    "name": "23a4ae46b0ef351ed2610060a6aa075068b94f10a6969493e4e11a10f1dfeff2",
                    "namespace": "default",
                    "node": "aks-agentpool-86501056-vmss00000c",
                    "pod": "flask-app-7b9749d9bb-z5pgn",
                    "service": "prometheus-kube-prometheus-kubelet"
                },
                "value": [
                    1745502608.939,
                    "225280"
                ]
            },
            {
                "metric": {
                    "__name__": "container_memory_usage_bytes",
                    "container": "flask-app",
                    "endpoint": "https-metrics",
                    "id": "/kubepods.slice/kubepods-burstable.slice/kubepods-burstable-pod6257da9c_1c66_4a50_bea3_dea45d630d06.slice/cri-containerd-2f45ecd450210b0592300fb1184040cbf1c77a4864f6877e51d0867a467f542a.scope",
                    "image": "docker.io/buddhimah/flask-performance-app:latest",
                    "instance": "10.224.0.5:10250",
                    "job": "kubelet",
                    "metrics_path": "/metrics/cadvisor",
                    "name": "2f45ecd450210b0592300fb1184040cbf1c77a4864f6877e51d0867a467f542a",
                    "namespace": "default",
                    "node": "aks-agentpool-86501056-vmss00000c",
                    "pod": "flask-app-7b9749d9bb-758vs",
                    "service": "prometheus-kube-prometheus-kubelet"
                },
                "value": [
                    1745502608.939,
                    "21536768"
                ]
            },
            {
                "metric": {
                    "__name__": "container_memory_usage_bytes",
                    "container": "flask-app",
                    "endpoint": "https-metrics",
                    "id": "/kubepods.slice/kubepods-burstable.slice/kubepods-burstable-podf0981aa9_9a0e_47cd_8162_08da9610fe2b.slice/cri-containerd-07c3604f1449591da2cd25b7cc29e02f63bb0eaedbfebe51b948f70b1f1c4902.scope",
                    "image": "docker.io/buddhimah/flask-performance-app:latest",
                    "instance": "10.224.0.5:10250",
                    "job": "kubelet",
                    "metrics_path": "/metrics/cadvisor",
                    "name": "07c3604f1449591da2cd25b7cc29e02f63bb0eaedbfebe51b948f70b1f1c4902",
                    "namespace": "default",
                    "node": "aks-agentpool-86501056-vmss00000c",
                    "pod": "flask-app-7b9749d9bb-z5pgn",
                    "service": "prometheus-kube-prometheus-kubelet"
                },
                "value": [
                    1745502608.939,
                    "21639168"
                ]
            }
        ]
    }
}


http://localhost:91/api/v1/query?query=container_fs_reads_bytes_total{pod=~"flask-app.*",namespace="default"}


{
    "status": "success",
    "data": {
        "resultType": "vector",
        "result": [
            {
                "metric": {
                    "__name__": "container_fs_reads_bytes_total",
                    "device": "/dev/sda",
                    "endpoint": "https-metrics",
                    "id": "/kubepods.slice/kubepods-burstable.slice/kubepods-burstable-pod6257da9c_1c66_4a50_bea3_dea45d630d06.slice",
                    "instance": "10.224.0.5:10250",
                    "job": "kubelet",
                    "metrics_path": "/metrics/cadvisor",
                    "namespace": "default",
                    "node": "aks-agentpool-86501056-vmss00000c",
                    "pod": "flask-app-7b9749d9bb-758vs",
                    "service": "prometheus-kube-prometheus-kubelet"
                },
                "value": [
                    1745502694.142,
                    "0"
                ]
            },
            {
                "metric": {
                    "__name__": "container_fs_reads_bytes_total",
                    "device": "/dev/sda",
                    "endpoint": "https-metrics",
                    "id": "/kubepods.slice/kubepods-burstable.slice/kubepods-burstable-podf0981aa9_9a0e_47cd_8162_08da9610fe2b.slice",
                    "instance": "10.224.0.5:10250",
                    "job": "kubelet",
                    "metrics_path": "/metrics/cadvisor",
                    "namespace": "default",
                    "node": "aks-agentpool-86501056-vmss00000c",
                    "pod": "flask-app-7b9749d9bb-z5pgn",
                    "service": "prometheus-kube-prometheus-kubelet"
                },
                "value": [
                    1745502694.142,
                    "0"
                ]
            },
            {
                "metric": {
                    "__name__": "container_fs_reads_bytes_total",
                    "container": "flask-app",
                    "device": "/dev/sda",
                    "endpoint": "https-metrics",
                    "id": "/kubepods.slice/kubepods-burstable.slice/kubepods-burstable-pod6257da9c_1c66_4a50_bea3_dea45d630d06.slice/cri-containerd-2f45ecd450210b0592300fb1184040cbf1c77a4864f6877e51d0867a467f542a.scope",
                    "image": "docker.io/buddhimah/flask-performance-app:latest",
                    "instance": "10.224.0.5:10250",
                    "job": "kubelet",
                    "metrics_path": "/metrics/cadvisor",
                    "name": "2f45ecd450210b0592300fb1184040cbf1c77a4864f6877e51d0867a467f542a",
                    "namespace": "default",
                    "node": "aks-agentpool-86501056-vmss00000c",
                    "pod": "flask-app-7b9749d9bb-758vs",
                    "service": "prometheus-kube-prometheus-kubelet"
                },
                "value": [
                    1745502694.142,
                    "0"
                ]
            },
            {
                "metric": {
                    "__name__": "container_fs_reads_bytes_total",
                    "container": "flask-app",
                    "device": "/dev/sda",
                    "endpoint": "https-metrics",
                    "id": "/kubepods.slice/kubepods-burstable.slice/kubepods-burstable-podf0981aa9_9a0e_47cd_8162_08da9610fe2b.slice/cri-containerd-07c3604f1449591da2cd25b7cc29e02f63bb0eaedbfebe51b948f70b1f1c4902.scope",
                    "image": "docker.io/buddhimah/flask-performance-app:latest",
                    "instance": "10.224.0.5:10250",
                    "job": "kubelet",
                    "metrics_path": "/metrics/cadvisor",
                    "name": "07c3604f1449591da2cd25b7cc29e02f63bb0eaedbfebe51b948f70b1f1c4902",
                    "namespace": "default",
                    "node": "aks-agentpool-86501056-vmss00000c",
                    "pod": "flask-app-7b9749d9bb-z5pgn",
                    "service": "prometheus-kube-prometheus-kubelet"
                },
                "value": [
                    1745502694.142,
                    "0"
                ]
            }
        ]
    }
}

http://localhost:8080/select_shard?type=analytics