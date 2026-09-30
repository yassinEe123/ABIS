#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════
#  ABIS — Script d'arrêt
# ═══════════════════════════════════════════════════════════
CYAN='\033[0;36m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RESET='\033[0m'; BOLD='\033[1m'

echo ""
echo -e "${CYAN}${BOLD}  🛡  ABIS — Arrêt en cours...${RESET}"
echo ""

# Tuer la session tmux
if tmux has-session -t abis 2>/dev/null; then
    tmux kill-session -t abis
    echo -e "${GREEN}  ✔  Session tmux arrêtée${RESET}"
fi

# Libérer les ports par sécurité
for PORT in 8545 8000 5173; do
    PID=$(lsof -ti :"$PORT" 2>/dev/null || true)
    if [ -n "$PID" ]; then
        kill "$PID" 2>/dev/null || true
        echo -e "${GREEN}  ✔  Port $PORT libéré${RESET}"
    fi
done

echo ""
echo -e "${GREEN}${BOLD}  ✅  ABIS arrêté proprement.${RESET}"
echo ""
