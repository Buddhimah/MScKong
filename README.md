
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


