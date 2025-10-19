#!/usr/bin/env bash
set -euo pipefail

# Find regions where BOTH sizes are available to your subscription.
# Requirements: Azure CLI (az) logged in, with the right subscription selected.

SIZES=("Standard_D2as_v5" "Standard_E2as_v5")
FIRST_ONLY="${FIRST_ONLY:-0}"   # set FIRST_ONLY=1 to stop at the first match

# Get all region names available to your subscription
echo "Fetching Azure regions for this subscription..."
REGIONS=$(az account list-locations --query "[].name" -o tsv)

is_size_available() {
  local region="$1"
  local size="$2"
  # Return 0 (true) if the SKU exists in region AND has no restrictions
  # We query for exact name match and ensure 'restrictions' is null or empty.
  local found
  found=$(az vm list-skus -l "$region" --all \
    --query "[?name=='$size' && (length(restrictions)==\`0\` || !not_null(restrictions))].name" \
    -o tsv || true)
  [[ -n "$found" ]]
}

MATCHED=()

for r in $REGIONS; do
  ok=1
  for sz in "${SIZES[@]}"; do
    if ! is_size_available "$r" "$sz"; then
      ok=0
      break
    fi
  done
  if [[ $ok -eq 1 ]]; then
    MATCHED+=("$r")
    echo "✅ $r supports: ${SIZES[*]}"
    if [[ "$FIRST_ONLY" == "1" ]]; then
      exit 0
    fi
  else
    echo "—  $r: one or more sizes unavailable"
  fi
done

echo
if [[ ${#MATCHED[@]} -gt 0 ]]; then
  echo "Regions with BOTH ${SIZES[*]}:"
  printf ' - %s\n' "${MATCHED[@]}"
  exit 0
else
  echo "No regions found where BOTH sizes are available to your subscription."
  echo "Tip: try a nearby region (e.g., eastus2) or request quota/availability."
  exit 1
fi
