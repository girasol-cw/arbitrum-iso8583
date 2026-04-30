#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────────────────────
# start.sh  —  Spin up Anvil + deploy ArbitrumSettlementCore + open UI
#
# Usage:
#   chmod +x start.sh
#   ./start.sh            # starts everything
#   ./start.sh --no-open  # skip auto-opening the browser
# ──────────────────────────────────────────────────────────────────────────────
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONTRACTS_DIR="$SCRIPT_DIR/contracts"
UI_DIR="$SCRIPT_DIR/ui"
RPC_URL="http://127.0.0.1:8545"
ANVIL_PID_FILE="/tmp/arbitrum-settlement-anvil.pid"
OPEN_BROWSER=true

for arg in "$@"; do
  [[ "$arg" == "--no-open" ]] && OPEN_BROWSER=false
done

# ── Colours ───────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; BOLD='\033[1m'; NC='\033[0m'

info()    { echo -e "${CYAN}[info]${NC}  $*"; }
success() { echo -e "${GREEN}[ok]${NC}    $*"; }
warn()    { echo -e "${YELLOW}[warn]${NC}  $*"; }
error()   { echo -e "${RED}[error]${NC} $*"; exit 1; }
sep()     { echo -e "${CYAN}─────────────────────────────────────────────────${NC}"; }

# ── Deps check ────────────────────────────────────────────────────────────────
command -v anvil >/dev/null 2>&1 || error "anvil not found. Install Foundry: https://getfoundry.sh"
command -v forge  >/dev/null 2>&1 || error "forge not found. Install Foundry: https://getfoundry.sh"

# ── Kill any existing Anvil on 8545 ──────────────────────────────────────────
if lsof -ti:8545 >/dev/null 2>&1; then
  warn "Port 8545 already in use — killing existing process..."
  kill "$(lsof -ti:8545)" 2>/dev/null || true
  sleep 1
fi

# ── Start Anvil ───────────────────────────────────────────────────────────────
sep
info "Starting Anvil on ${RPC_URL} ..."

anvil \
  --host 127.0.0.1 \
  --port 8545 \
  --block-time 1 \
  --chain-id 31337 \
  --accounts 10 \
  --balance 10000 \
  --silent \
  &

ANVIL_PID=$!
echo "$ANVIL_PID" > "$ANVIL_PID_FILE"

# Wait for Anvil to be ready
for i in {1..20}; do
  sleep 0.4
  if curl -sf -X POST "$RPC_URL" \
       -H 'Content-Type: application/json' \
       -d '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}' \
       >/dev/null 2>&1; then
    success "Anvil is ready (PID $ANVIL_PID)"
    break
  fi
  if [[ $i -eq 20 ]]; then
    error "Anvil did not start in time"
  fi
done

# ── Deploy contracts ──────────────────────────────────────────────────────────
sep
info "Building & deploying contracts..."

cd "$CONTRACTS_DIR"

# Run the deploy script and capture output
DEPLOY_OUT=$(forge script script/Deploy.s.sol \
  --rpc-url "$RPC_URL" \
  --broadcast \
  --silent \
  2>&1) || { echo "$DEPLOY_OUT"; error "Deployment failed"; }

# ── Extract addresses from broadcast ─────────────────────────────────────────
BROADCAST_FILE="$CONTRACTS_DIR/broadcast/Deploy.s.sol/31337/run-latest.json"

if [[ ! -f "$BROADCAST_FILE" ]]; then
  error "Broadcast file not found: $BROADCAST_FILE"
fi

# Parse addresses — Deploy creates: MockERC20 (x2), ArbitrumSettlementCore
CONTRACT_ADDRS=()
while IFS= read -r addr; do
  CONTRACT_ADDRS+=("$addr")
done < <(python3 -c "
import json, sys
with open('$BROADCAST_FILE') as f:
    data = json.load(f)
for tx in data.get('transactions', []):
    if tx.get('transactionType') == 'CREATE':
        print(tx['contractAddress'])
" 2>/dev/null || jq -r '.transactions[] | select(.transactionType=="CREATE") | .contractAddress' "$BROADCAST_FILE" 2>/dev/null)

# Contract order: USDC, WETH, ArbitrumSettlementCore
USDC_ADDR="${CONTRACT_ADDRS[0]:-}"
WETH_ADDR="${CONTRACT_ADDRS[1]:-}"
CORE_ADDR="${CONTRACT_ADDRS[2]:-}"

# ── Print summary ─────────────────────────────────────────────────────────────
sep
echo -e "${BOLD}  Deployment Summary${NC}"
sep
echo -e "  Core Contract  ${GREEN}${CORE_ADDR}${NC}"
echo -e "  USDC Token     ${GREEN}${USDC_ADDR}${NC}"
echo -e "  WETH Token     ${GREEN}${WETH_ADDR}${NC}"
sep
echo -e "${BOLD}  Test Accounts${NC}"
sep
echo -e "  ${BOLD}[0] Admin / Pauser / TokenAdmin${NC}"
echo -e "      Addr: ${CYAN}0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266${NC}"
echo -e "      PK:   0xac0974bec39a17e36ba4a6b4d238ff944bacb478ce64388c4a6483fcf8b60c6"
echo ""
echo -e "  ${BOLD}[1] Relayer${NC}"
echo -e "      Addr: ${CYAN}0x70997970C51812dc3A010C7d01b50e0d17dc79C8${NC}"
echo -e "      PK:   0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d"
echo ""
echo -e "  ${BOLD}[2] User A${NC}"
echo -e "      Addr: ${CYAN}0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC${NC}"
echo -e "      PK:   0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a"
echo ""
echo -e "  ${BOLD}[3] Merchant${NC}"
echo -e "      Addr: ${CYAN}0x90F79bf6EB2c4f870365E785982E1f101E93b906${NC}"
echo -e "      PK:   0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6"
sep

# ── Write addresses to a JSON file for the UI to read ────────────────────────
ADDR_FILE="$UI_DIR/addresses.json"
cat > "$ADDR_FILE" <<EOF
{
  "rpcUrl":       "${RPC_URL}",
  "coreAddress":  "${CORE_ADDR}",
  "usdcAddress":  "${USDC_ADDR}",
  "wethAddress":  "${WETH_ADDR}"
}
EOF
success "Addresses written to ui/addresses.json"

# ── Patch the UI with the live addresses via a tiny Python one-liner ───────────
python3 - <<PYEOF
import re, pathlib

html_path = pathlib.Path("$UI_DIR/index.html")
html = html_path.read_text()

replacements = {
    r'(id="core-addr"[^>]*value=")[^"]*(")',  lambda m: m.group(1) + "${CORE_ADDR}" + m.group(2),
    r'(id="usdc-addr"[^>]*value=")[^"]*(")',  lambda m: m.group(1) + "${USDC_ADDR}" + m.group(2),
    r'(id="weth-addr"[^>]*value=")[^"]*(")',  lambda m: m.group(1) + "${WETH_ADDR}" + m.group(2),
}
# We only patch placeholder="" inputs that have no value yet
for pat, repl in replacements.items():
    html = re.sub(pat, repl, html)

html_path.write_text(html)
print("HTML patched with live addresses ✓")
PYEOF

# ── Start a simple HTTP server for the UI ─────────────────────────────────────
sep
info "Starting UI server at http://127.0.0.1:8080 ..."

cd "$UI_DIR"
python3 -m http.server 8080 --bind 127.0.0.1 >/dev/null 2>&1 &
UI_PID=$!

sleep 0.5
success "UI server started (PID $UI_PID)"

# ── Open browser ──────────────────────────────────────────────────────────────
if $OPEN_BROWSER; then
  UI_URL="http://127.0.0.1:8080"
  if command -v xdg-open >/dev/null 2>&1; then
    xdg-open "$UI_URL" &
  elif command -v open >/dev/null 2>&1; then
    open "$UI_URL"
  else
    warn "Cannot auto-open browser. Please navigate to ${UI_URL}"
  fi
fi

sep
echo -e "${BOLD}${GREEN}  Everything is running!${NC}"
echo -e "  UI:   http://127.0.0.1:8080"
echo -e "  RPC:  http://127.0.0.1:8545"
sep
echo -e "  Press ${BOLD}Ctrl+C${NC} to stop all services."
sep

# ── Cleanup on exit ───────────────────────────────────────────────────────────
cleanup() {
  echo ""
  info "Shutting down..."
  kill "$UI_PID"    2>/dev/null || true
  kill "$ANVIL_PID" 2>/dev/null || true
  rm -f "$ANVIL_PID_FILE"
  success "Done."
}
trap cleanup INT TERM

wait "$ANVIL_PID"
