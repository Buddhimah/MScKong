docker build -t buddhimah/demo-app:3.0.0 .
 docker push buddhimah/demo-app:3.0.0


# Resource group & cluster
az group create -n rg-routing -l centralus
az aks create -n aks-routing -g rg-routing --location centralus --node-count 1 --node-vm-size Standard_B2ms --generate-ssh-keys

# Add three user pools (1 node each)
az aks nodepool add -g rg-routing --cluster-name aks-routing -n cpu --node-count 1 --node-vm-size Standard_D2as_v4
az aks nodepool add -g rg-routing --cluster-name aks-routing -n mem --node-count 1 --node-vm-size Standard_E2as_v4
az aks nodepool add -g rg-routing --cluster-name aks-routing -n io  --node-count 1 --node-vm-size Standard_D2as_v4

# Kube access
az aks get-credentials -n aks-routing -g rg-routing

# Namespaces & ingress
kubectl create ns baseline
kubectl create ns policy
helm repo add ingress-nginx https://kubernetes.github.io/ingress-nginx
helm install ng -n ingress-nginx ingress-nginx/ingress-nginx --create-namespace

kubectl create -f .\configmap-and-job.yaml

kubectl -n baseline logs -f -l app=demo-app --prefix --tail=-1 | Tee-Object -FilePath baseline.jsonl
kubectl -n policy logs -f -l app=demo-app --prefix --tail=-1 | Tee-Object -FilePath policy_app.jsonl
kubectl -n policy logs -f -l app=router --prefix --tail=-1 | Tee-Object -FilePath policy_router.jsonl


python3 analyze.py baseline.jsonl policy_app.jsonl policy_router.jsonl



# Restart baseline deployment
kubectl -n baseline rollout restart deploy/demo-baseline
kubectl -n baseline rollout status  deploy/demo-baseline

# Restart policy shards + router
kubectl -n policy rollout restart deploy/cpu-shard
kubectl -n policy rollout restart deploy/mem-shard
kubectl -n policy rollout restart deploy/io-shard
kubectl -n policy rollout restart deploy/router
kubectl -n policy rollout status  deploy/cpu-shard
kubectl -n policy rollout status  deploy/mem-shard
kubectl -n policy rollout status  deploy/io-shard
kubectl -n policy rollout status  deploy/router


