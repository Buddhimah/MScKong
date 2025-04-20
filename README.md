
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