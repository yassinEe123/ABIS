# ABIS Attack Simulation Scripts

All scripts target contracts loaded from `../../deployments/localhost.json`.

Run any script with:
```
npx hardhat run scripts/attacks/<name>.js --network localhost
```

---

## Category 1 — Burst (same target)

| # | File | Description |
|---|------|-------------|
| 1 | `burst_dex_same.js` | 12 rapid `buyTokens` on DEX (0.008–0.03 ETH each, signer[2]) |
| 2 | `burst_token_same.js` | 12 rapid token transfers to one fixed recipient (signer[3]) |
| 3 | `burst_vault_same.js` | 12 rapid vault deposits (0.05–0.5 ETH each, signer[4]) |
| 4 | `burst_lending_same.js` | 10 rapid lending deposits (0.1–2 ETH each, signer[5]) |
| 5 | `burst_wallet_same.js` | 12 rapid direct ETH sends to fixed wallet (signer[6]) |
| 6 | `micro_burst.js` | 40 tiny vault deposits (0.001–0.005 ETH, 200ms, signer[7]) |
| 7 | `mega_burst.js` | 70 vault deposits with alternating amounts (100ms, signer[8]) |

---

## Category 2 — Spray (multi-target)

| # | File | Description |
|---|------|-------------|
| 8  | `spray_token_multi.js` | 15 token transfers each to a different signer (signer[2]) |
| 9  | `spray_eth_multi.js` | 15 ETH sends each to a different address (signer[3]) |
| 10 | `spray_vault_multi.js` | 12 vault deposits from 4 different attackers (signer[4–7]) |
| 11 | `spray_dex_multi.js` | 12 DEX buyTokens from 4 different signers (signer[2–5]) |
| 12 | `fan_out_attack.js` | 40 ETH sends each to a different address (200ms, signer[2]) |

---

## Category 3 — Price Manipulation

| # | File | Description |
|---|------|-------------|
| 13 | `pump_dump_token.js` | Buy 8× to inflate price then dump via sellTokens (signer[3]) |
| 14 | `wash_trading.js` | 6 cycles: buyTokens then immediately sellTokens same amount (signer[4]) |
| 15 | `price_slippage_abuse.js` | 3 very large buyTokens (5–50 ETH) to cause extreme slippage (signer[5]) |
| 16 | `sandwich_attack.js` | Front-run → victim → back-run sandwich over 3 DEX rounds (signer[2]) |
| 17 | `front_running.js` | 4 ultra-fast buyTokens at 50–150ms to simulate mempool front-runner (signer[3]) |

---

## Category 4 — Liquidity Manipulation

| # | File | Description |
|---|------|-------------|
| 18 | `liquidity_drain.js` | Deposit 10 ETH then 3 large withdrawals to drain vault liquidity (signer[4]) |
| 19 | `liquidity_inject_withdraw.js` | 8 cycles: lending deposit then immediate withdraw (signer[5]) |
| 20 | `pool_imbalance_attack.js` | 3 oversized DEX buyTokens (10–100 ETH) to skew pool ratio (signer[6]) |

---

## Category 5 — Lending Attacks

| # | File | Description |
|---|------|-------------|
| 21 | `borrow_max_ltv.js` | Deposit 5 ETH then repeatedly borrow 1 ETH at max LTV (signer[7]) |
| 22 | `collateral_dump.js` | 8 rapid large deposits to flood collateral tracking (signer[8]) |
| 23 | `flash_borrow_repay.js` | 4 cycles: deposit → borrow → immediate repay at 100ms (signer[9]) |
| 24 | `liquidation_trigger.js` | Borrow then attempt 5 withdrawals to trigger under-collateralization (signer[10]) |
| 25 | `debt_loop.js` | 10 borrow-repay cycles after 5 ETH collateral deposit (signer[11]) |

---

## Category 6 — Sybil & Identity

| # | File | Description |
|---|------|-------------|
| 26 | `sybil_attack.js` | 3 identities (signer[2–4]) each send 8 vault deposits independently |
| 27 | `new_wallet_burst.js` | signer[15] (new wallet) sends 15 rapid vault deposits at 200ms |
| 28 | `coordinated_wallets.js` | 4 signers (signer[2–5]) simultaneously hit vault in 3 synchronized rounds |
| 29 | `relay_attack.js` | ETH relay chain signer[2]→[3]→[4]→[5] repeated 5 times (500ms hops) |

---

## Category 7 — Draining

| # | File | Description |
|---|------|-------------|
| 30 | `vault_drain.js` | Deposit 10 ETH then staged large withdrawals (5/3/2 ETH, signer[3]) |
| 31 | `token_drain.js` | 3 very large token transfers (5k–50k tokens) with delays (signer[4]) |
| 32 | `wallet_drain_slow.js` | 5 ETH sends spaced 10s apart simulating patient hours-long drain (signer[5]) |
| 33 | `wallet_drain_fast.js` | 2 instant large ETH sends (1 ETH + 20 ETH) to drain quickly (signer[6]) |
| 34 | `contract_drain.js` | 20 rapid 0.1 ETH withdrawals after 5 ETH deposit (100ms, signer[7]) |

---

## Category 8 — Low & Slow

| # | File | Description |
|---|------|-------------|
| 35 | `low_and_slow.js` | 3 small vault deposits with 5s simulated long delays (signer[8]) |
| 36 | `gradual_escalation.js` | 8 deposits escalating 0.01→5 ETH with 2s pauses (signer[9]) |
| 37 | `periodic_bot.js` | 5 DEX buys at 3s intervals simulating a 15s periodic bot (signer[10]) |
| 38 | `night_owl.js` | 5 slow vault deposits at 8s intervals simulating off-hours activity (signer[11]) |
| 39 | `stealth_accumulation.js` | 10 tiny DEX buys mixed with vault txs to disguise accumulation (signer[12]) |

---

## Category 9 — Contract Exploits

| # | File | Description |
|---|------|-------------|
| 40 | `reentrancy_simulation.js` | 25 rapid vault deposits at 50–500ms simulating reentrancy call depth (signer[2]) |
| 41 | `integer_overflow_probe.js` | 2 × 1000 ETH buyTokens probing for overflow — expect BLOCKED (signer[3]) |
| 42 | `zero_value_spam.js` | 50 zero-value direct txs to vault address (100ms, signer[4]) |
| 43 | `gas_griefing.js` | 30 minimum-cost vault deposits to grief gas and clog mempool (signer[5]) |
| 44 | `contract_call_flood.js` | 50 rapid 0.001 ETH vault deposits at 80ms to DoS contract (signer[6]) |

---

## Category 10 — MEV & Arbitrage

| # | File | Description |
|---|------|-------------|
| 45 | `mev_bot_pattern.js` | 6 buy-sell cycles at 50–500ms simulating MEV value extraction (signer[7]) |
| 46 | `arbitrage_aggressive.js` | Alternating vault deposits and DEX buys rapidly (3 of each, signer[8]) |
| 47 | `sniper_bot.js` | Single ultra-fast buyTokens at 10–150ms latency simulating sniper bot (signer[9]) |
| 48 | `block_stuffing.js` | 100 tiny vault deposits at 10–300ms to stuff blocks with congestion (signer[10]) |

---

## Notes

- `sellTokens` always requires a prior `token.approve(dep.dex, amount)` call
- All token amounts use 18 decimals: `hre.ethers.parseUnits("100", 18)`
- Scripts with long real-world delays simulate them with shorter sleeps and print `⏳ Simulating Xs delay...`
- Each tx is wrapped in try/catch; on failure prints `❌ BLOCKED` and breaks the loop
- `signers[0]` is always the admin/owner — never used as attacker
