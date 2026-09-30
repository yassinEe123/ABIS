#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════
#  ABIS — AI Blockchain Immune System  |  Script de démarrage
# ═══════════════════════════════════════════════════════════════
set -e

ABIS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SESSION="abis"

# ── Couleurs ──────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; BOLD='\033[1m'; RESET='\033[0m'

echo ""
echo -e "${CYAN}${BOLD}  🛡  ABIS — AI Blockchain Immune System${RESET}"
echo -e "${CYAN}  ════════════════════════════════════════${RESET}"
echo ""

# ── Tuer une ancienne session tmux si elle existe ─────────────
if tmux has-session -t "$SESSION" 2>/dev/null; then
    echo -e "${YELLOW}  ⚠  Session tmux '$SESSION' existante — suppression...${RESET}"
    tmux kill-session -t "$SESSION"
    sleep 1
fi

# ── Tuer les anciens processus sur les ports utilisés ─────────
for PORT in 8545 8000 5173; do
    PID=$(lsof -ti :"$PORT" 2>/dev/null || true)
    if [ -n "$PID" ]; then
        echo -e "${YELLOW}  ⚠  Port $PORT occupé (PID $PID) — libération...${RESET}"
        kill "$PID" 2>/dev/null || true
        sleep 1
    fi
done

echo -e "${GREEN}  ✔  Ports libres${RESET}"

# ── Créer la session tmux ─────────────────────────────────────
# Disposition :
#   ┌────────────────────┬────────────────────┐
#   │  Hardhat node      │  Agent IA          │
#   │  (blockchain)      │  (ML monitoring)   │
#   ├────────────────────┼────────────────────┤
#   │  FastAPI           │  React Frontend    │
#   │  (port 8000)       │  (port 5173)       │
#   └────────────────────┴────────────────────┘

tmux new-session  -d -s "$SESSION" -x 220 -y 50
tmux rename-window -t "$SESSION:0" "ABIS"

# Capture pane IDs to avoid renumbering confusion after splits
PANE_HARDHAT=$(tmux display-message -t "$SESSION:0.0" -p "#{pane_id}")

# Split right → Agent IA
PANE_AGENT=$(tmux split-window -t "$SESSION:0.0" -h -P -F "#{pane_id}")

# Split bottom-left → FastAPI
PANE_API=$(tmux split-window -t "$PANE_HARDHAT" -v -P -F "#{pane_id}")

# Split bottom-right → Frontend
PANE_FRONTEND=$(tmux split-window -t "$PANE_AGENT" -v -P -F "#{pane_id}")

# Panneau Hardhat (haut-gauche)
tmux send-keys -t "$PANE_HARDHAT" "cd '$ABIS_DIR/blockchain' && echo -e '\033[0;36m🔗  Démarrage du nœud Hardhat...\033[0m' && npx hardhat node" Enter

# Attendre que Hardhat soit prêt
echo -e "${YELLOW}  ⏳  Attente du nœud Hardhat...${RESET}"
for i in $(seq 1 20); do
    sleep 1
    if curl -sf http://127.0.0.1:8545 > /dev/null 2>&1; then
        echo -e "${GREEN}  ✔  Hardhat prêt (${i}s)${RESET}"
        break
    fi
    if [ "$i" -eq 20 ]; then
        echo -e "${RED}  ✗  Hardhat n'a pas démarré — abandon${RESET}"
        exit 1
    fi
done

# Déployer les contrats
echo -e "${YELLOW}  📦  Déploiement des contrats...${RESET}"
cd "$ABIS_DIR/blockchain"
DEPLOY_OUT=$(npx hardhat run scripts/deploy.js --network localhost 2>&1)
echo "$DEPLOY_OUT" | grep -E "(✅|❌|Error)" || true
echo -e "${GREEN}  ✔  Contrats déployés${RESET}"

# Panneau Agent IA (haut-droite)
tmux send-keys -t "$PANE_AGENT" "cd '$ABIS_DIR' && echo -e '\033[0;35m🤖  Démarrage de l'\''agent IA...\033[0m' && python3 ai/agent/abis_agent.py" Enter

# Panneau FastAPI (bas-gauche)
tmux send-keys -t "$PANE_API" "cd '$ABIS_DIR/dashboard/api' && echo -e '\033[0;33m⚡  Démarrage de l'\''API FastAPI...\033[0m' && uvicorn main:app --host 0.0.0.0 --port 8000 --reload" Enter

# Panneau Frontend React (bas-droite)
tmux send-keys -t "$PANE_FRONTEND" "cd '$ABIS_DIR/dashboard/frontend' && echo -e '\033[0;32m🌐  Démarrage du dashboard React...\033[0m' && npm run dev" Enter

# Sélectionner le panneau haut-gauche au démarrage
tmux select-pane -t "$PANE_HARDHAT"

# ── Attendre que l'API et le frontend soient prêts ────────────
echo -e "${YELLOW}  ⏳  Attente de l'API...${RESET}"
for i in $(seq 1 30); do
    sleep 1
    if curl -sf http://127.0.0.1:8000/health > /dev/null 2>&1; then
        echo -e "${GREEN}  ✔  API prête (${i}s)${RESET}"
        break
    fi
done

echo -e "${YELLOW}  ⏳  Attente du frontend...${RESET}"
for i in $(seq 1 30); do
    sleep 1
    if curl -sf http://localhost:5173 > /dev/null 2>&1; then
        echo -e "${GREEN}  ✔  Frontend prêt (${i}s)${RESET}"
        break
    fi
done

# ── Ouvrir le navigateur ──────────────────────────────────────
echo -e "${CYAN}  🚀  Ouverture du dashboard...${RESET}"
xdg-open "http://localhost:5173" 2>/dev/null || \
firefox "http://localhost:5173" 2>/dev/null || \
chromium "http://localhost:5173" 2>/dev/null || \
echo -e "${YELLOW}  ℹ  Ouvre manuellement : http://localhost:5173${RESET}"

# ── Attacher la session tmux ──────────────────────────────────
echo ""
echo -e "${GREEN}${BOLD}  ✅  ABIS démarré avec succès !${RESET}"
echo ""
echo -e "  ${BOLD}Dashboard :${RESET}  http://localhost:5173"
echo -e "  ${BOLD}API :${RESET}        http://localhost:8000"
echo -e "  ${BOLD}Blockchain :${RESET} http://localhost:8545"
echo ""
echo -e "  ${CYAN}Raccourcis tmux :${RESET}"
echo -e "  ${BOLD}Ctrl+B puis flèches${RESET} → naviguer entre les panneaux"
echo -e "  ${BOLD}Ctrl+B puis D${RESET}       → détacher (projet reste actif)"
echo -e "  ${BOLD}Ctrl+C${RESET}              → arrêter le service dans un panneau"
echo ""
echo -e "${CYAN}  ════════════════════════════════════════${RESET}"

# Attacher tmux (le terminal devient la session tmux)
tmux attach-session -t "$SESSION"
