
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

kubectl apply -f .\deployment.yaml

kubectl apply -f .\ingress.yaml

kubectl apply -f .\service.yaml

curl -v http://localhost/echo

## Deploy Custom LUA logic 

kubectl apply -f custom-routing-configmap.yaml
kubectl apply -f custom-routing-plugin.yaml
helm upgrade kong kong/kong --set customPlugins={custom-routing}