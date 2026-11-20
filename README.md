# ABIS – AI Blockchain Intrusion System

A 3-layer security system that detects and blocks attacks on a DeFi environment in real time, combining machine learning with on-chain enforcement.

Academic project – TEK-UP University (Cybersecurity Engineering, SSIR).

## How it works

1. **Blockchain layer** – a local DeFi playground (token, DEX, lending protocol, vault) written in Solidity and deployed with Hardhat. An `ABISRegistry` contract keeps the list of wallets flagged as malicious.
2. **AI layer** – an agent watches transactions and scores them with two models: an **Isolation Forest** for anomaly detection and a supervised **classifier** trained on generated normal / attack datasets. Wallet reputation is tracked over time.
3. **Dashboard** – live view of transactions, alerts and blocked wallets.

## Attack scenarios

More than 20 scripted attacks to test the detection, including front-running, flash borrow/repay, contract drain, gas griefing, block stuffing, coordinated wallets, collateral dump, debt loops and gradual escalation. See `blockchain/scripts/attacks/`.

## Project structure

```
ai/           agent, training scripts, wallet reputation data
blockchain/   Solidity contracts, Hardhat config, attack scripts
dashboard/    monitoring UI
tests/        test suite
```

## Run it

```bash
./start.sh     # tmux session: Hardhat node (:8545), AI agent, API (:8000), dashboard (:5173)
./stop.sh
```

Train the models:

```bash
cd ai/training && ./run_training.sh
```

## Stack

Solidity · Hardhat · JavaScript · Python · scikit-learn · Docker · tmux

## Docs

Full report (`rapport_abis.pdf`), technical documentation (`ABIS_Documentation.pdf`) and slides (`presentation_abis.pdf`) are in the repository.
