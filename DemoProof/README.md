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
