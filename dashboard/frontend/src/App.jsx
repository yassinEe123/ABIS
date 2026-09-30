import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "./App.css";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, BarChart, Bar,
  LineChart, Line, PieChart, Pie, Cell,
} from "recharts";

const API = "http://127.0.0.1:8000";
const BLOCK_DURATION_S = 600;

// ── Protocol config ───────────────────────────────────────────────────────────
const PROTO_CFG = {
  Vault:    { icon: "🏦", label: "DemoVault",    color: "#3b82f6", bg: "#1e3a5f" },
  Token:    { icon: "🪙", label: "ABISToken",    color: "#a855f7", bg: "#3b1f5f" },
  Dex:      { icon: "🔄", label: "ABISDex",      color: "#10b981", bg: "#064e3b" },
  Lending:  { icon: "💰", label: "ABISLending",  color: "#f59e0b", bg: "#451a03" },
  External: { icon: "🌐", label: "External",     color: "#64748b", bg: "#1e293b" },
  registry: { icon: "🛡️", label: "ABISRegistry", color: "#60a5fa", bg: "#1e3a5f" },
};
const cfg = (p) => PROTO_CFG[p] ?? PROTO_CFG.External;

// ── Attack catalogue (48 types) ───────────────────────────────────────────────
const CAT_COLORS = {
  BURST:     { bg: "#1f0808", fg: "#f87171", border: "#7f1d1d" },
  SPRAY:     { bg: "#1f1100", fg: "#fb923c", border: "#7c2d12" },
  MANIP:     { bg: "#1a1500", fg: "#fbbf24", border: "#713f12" },
  MEV:       { bg: "#160e2e", fg: "#c084fc", border: "#581c87" },
  LIQUIDITY: { bg: "#0a1f3a", fg: "#60a5fa", border: "#1e3a5f" },
  LENDING:   { bg: "#091a1a", fg: "#2dd4bf", border: "#134e4a" },
  SYBIL:     { bg: "#1a0a1e", fg: "#e879f9", border: "#701a75" },
  DRAIN:     { bg: "#1e0000", fg: "#ef4444", border: "#991b1b" },
  EVASION:   { bg: "#0c1a0c", fg: "#86efac", border: "#14532d" },
  EXPLOIT:   { bg: "#1a0505", fg: "#ff6b6b", border: "#7f1d1d" },
  SPAM:      { bg: "#111827", fg: "#94a3b8", border: "#1e293b" },
  BOT:       { bg: "#1a1a2e", fg: "#818cf8", border: "#312e81" },
  UNKNOWN:   { bg: "#1a0f2e", fg: "#a78bfa", border: "#5b21b6" },
};

const ATTACK_INFO = {
  burst_dex_same:        { name: "DEX Burst",              cat: "BURST",    desc: "Rafale de swaps répétés sur le même DEX en peu de secondes" },
  burst_token_same:      { name: "Token Burst",            cat: "BURST",    desc: "Transferts massifs et répétés vers le même contrat de token" },
  burst_vault_same:      { name: "Vault Burst",            cat: "BURST",    desc: "Dépôts/retraits en rafale sur un même vault" },
  burst_lending_same:    { name: "Lending Burst",          cat: "BURST",    desc: "Opérations de prêt répétées en rafale sur un protocole" },
  burst_wallet_same:     { name: "Wallet Burst",           cat: "BURST",    desc: "Flux intense de transactions vers un même wallet cible" },
  micro_burst:           { name: "Micro Burst",            cat: "BURST",    desc: "Rafale de micro-transactions (montants infimes, volume élevé)" },
  mega_burst:            { name: "Mega Burst",             cat: "BURST",    desc: "Rafale de transactions à valeur très élevée en secondes" },
  spray_token_multi:     { name: "Token Spray",            cat: "SPRAY",    desc: "Dispersion de tokens vers de nombreux destinataires simultanément" },
  spray_eth_multi:       { name: "ETH Spray",              cat: "SPRAY",    desc: "Envoi d'ETH à de multiples adresses en peu de temps" },
  spray_vault_multi:     { name: "Vault Spray",            cat: "SPRAY",    desc: "Interactions rapides avec de nombreux vaults distincts" },
  spray_dex_multi:       { name: "DEX Spray",              cat: "SPRAY",    desc: "Swaps sur plusieurs pools DEX en parallèle" },
  fan_out_attack:        { name: "Fan-Out",                cat: "SPRAY",    desc: "Fonds distribués vers des dizaines d'adresses pour masquer la trace" },
  pump_dump_token:       { name: "Pump & Dump",            cat: "MANIP",    desc: "Gonflement artificiel du prix d'un token suivi d'une vente massive" },
  wash_trading:          { name: "Wash Trading",           cat: "MANIP",    desc: "Échanges fictifs entre adresses contrôlées pour simuler du volume" },
  price_slippage_abuse:  { name: "Slippage Abuse",         cat: "MANIP",    desc: "Exploitation du slippage toléré pour extraire de la valeur sur un DEX" },
  sandwich_attack:       { name: "Sandwich Attack",        cat: "MEV",      desc: "Encadrement d'une transaction cible pour capturer son profit" },
  front_running:         { name: "Front-Running",          cat: "MEV",      desc: "Insertion d'une transaction avant une cible pour profiter de son effet" },
  mev_bot_pattern:       { name: "MEV Bot",                cat: "BOT",      desc: "Pattern de bot MEV (Maximal Extractable Value) automatisé" },
  arbitrage_aggressive:  { name: "Arbitrage Agressif",     cat: "MEV",      desc: "Arbitrage multi-pools ultra-rapide en quelques millisecondes" },
  sniper_bot:            { name: "Sniper Bot",             cat: "BOT",      desc: "Bot qui capture des opportunités dès leur apparition dans le mempool" },
  block_stuffing:        { name: "Block Stuffing",         cat: "SPAM",     desc: "Saturation d'un bloc pour retarder ou bloquer d'autres transactions" },
  liquidity_drain:       { name: "Liquidity Drain",        cat: "LIQUIDITY",desc: "Retrait massif et rapide de liquidité d'un pool DeFi" },
  liquidity_inject_withdraw: { name: "Inject & Withdraw",  cat: "LIQUIDITY",desc: "Injection puis retrait immédiat de liquidité pour perturber les prix" },
  pool_imbalance_attack: { name: "Pool Imbalance",         cat: "LIQUIDITY",desc: "Déséquilibre intentionnel des réserves d'un pool pour en profiter" },
  borrow_max_ltv:        { name: "Max LTV Borrow",         cat: "LENDING",  desc: "Emprunt jusqu'à la limite maximale du ratio prêt/collatéral" },
  collateral_dump:       { name: "Collateral Dump",        cat: "LENDING",  desc: "Dépôt massif de collatéral suivi d'emprunt maximal et fuite" },
  flash_borrow_repay:    { name: "Flash Borrow",           cat: "LENDING",  desc: "Emprunt et remboursement dans le même bloc pour éviter les intérêts" },
  liquidation_trigger:   { name: "Liquidation Trigger",    cat: "LENDING",  desc: "Manipulation forcée d'une position vers la liquidation" },
  debt_loop:             { name: "Debt Loop",              cat: "LENDING",  desc: "Boucle dépôt→emprunt→redépôt pour amplifier l'effet de levier" },
  sybil_attack:          { name: "Sybil Attack",           cat: "SYBIL",    desc: "Multiples wallets coordonnés simulant des utilisateurs indépendants" },
  new_wallet_burst:      { name: "New Wallet Burst",       cat: "SYBIL",    desc: "Burst lancé depuis un wallet créé récemment (adresse fraîche)" },
  coordinated_wallets:   { name: "Wallets Coordonnés",     cat: "SYBIL",    desc: "Plusieurs wallets agissant en synchronisation précise" },
  relay_attack:          { name: "Relay Attack",           cat: "SYBIL",    desc: "Chaîne de wallets relayant des fonds pour masquer l'origine" },
  vault_drain:           { name: "Vault Drain",            cat: "DRAIN",    desc: "Extraction systématique et rapide des fonds d'un vault" },
  token_drain:           { name: "Token Drain",            cat: "DRAIN",    desc: "Vidage progressif du solde d'un contrat de tokens" },
  wallet_drain_fast:     { name: "Fast Wallet Drain",      cat: "DRAIN",    desc: "Transfert rapide de tous les fonds d'un wallet en quelques blocs" },
  wallet_drain_slow:     { name: "Slow Wallet Drain",      cat: "DRAIN",    desc: "Vidage lent et discret d'un wallet pour éviter la détection" },
  contract_drain:        { name: "Contract Drain",         cat: "DRAIN",    desc: "Exploitation d'une faille pour extraire les fonds d'un contrat" },
  low_and_slow:          { name: "Low & Slow",             cat: "EVASION",  desc: "Attaque lente et progressive sous le seuil de détection classique" },
  gradual_escalation:    { name: "Gradual Escalation",     cat: "EVASION",  desc: "Montée en puissance progressive pour passer sous les radars" },
  periodic_bot:          { name: "Periodic Bot",           cat: "BOT",      desc: "Transactions régulières et automatisées à intervalle fixe" },
  night_owl:             { name: "Night Owl",              cat: "EVASION",  desc: "Activité anormale concentrée en dehors des heures habituelles" },
  stealth_accumulation:  { name: "Stealth Accumulation",   cat: "EVASION",  desc: "Accumulation silencieuse de fonds via de petites transactions" },
  reentrancy_simulation: { name: "Reentrancy Probe",       cat: "EXPLOIT",  desc: "Simulation d'attaque reentrancy sur un contrat vulnérable" },
  integer_overflow_probe:{ name: "Overflow Probe",         cat: "EXPLOIT",  desc: "Test de vulnérabilité integer overflow sur les calculs du contrat" },
  zero_value_spam:       { name: "Zero-Value Spam",        cat: "SPAM",     desc: "Envoi massif de transactions à 0 ETH pour saturer le réseau" },
  gas_griefing:          { name: "Gas Griefing",           cat: "SPAM",     desc: "Saturation du réseau avec des transactions très coûteuses en gas" },
  contract_call_flood:   { name: "Contract Flood",         cat: "SPAM",     desc: "Flood de calls vers un contrat pour le rendre inutilisable" },
  phantom_strike:        { name: "Phantom Strike",          cat: "UNKNOWN",  desc: "Pattern inconnu — cross-protocol + montants zigzag + timing irrégulier. Détecté uniquement par l'IsolationForest." },
};

function describeUnknown(reason) {
  if (!reason) return "Comportement hors norme non répertorié dans les patterns connus";
  const cnt    = parseInt(reason.match(/cnt\d+s=(\d+)/)?.[1]  ?? 0);
  const window = parseInt(reason.match(/cnt(\d+)s=/)?.[1]     ?? 30);
  const unique = parseInt(reason.match(/unique_to=(\d+)/)?.[1] ?? 1);
  const risk   = parseFloat(reason.match(/risk=([\d.]+)/)?.[1] ?? 0);
  if (unique > 5) return `Flux dispersé vers ${unique} adresses distinctes en ${window}s — pattern de spray inconnu`;
  if (cnt > 8) return `Volume anormalement élevé (${cnt} tx en ${window}s) — non classifiable par le modèle`;
  return `Comportement inhabituel (${cnt} tx · ${unique} cible${unique > 1 ? "s" : ""} · fenêtre ${window}s) — score IsolationForest ${risk.toFixed(0)}`;
}

function parseAttack(reason, protocol) {
  if (!reason) return { action: "Unknown activity", pattern: "", cnt: 0, window: 30 };
  const cnt    = parseInt(reason.match(/cnt\d+s=(\d+)/)?.[1]  ?? 0);
  const window = parseInt(reason.match(/cnt(\d+)s=/)?.[1]     ?? 30);
  const unique = parseInt(reason.match(/unique_to=(\d+)/)?.[1] ?? 1);
  const same   = parseInt(reason.match(/same_to=(\d+)/)?.[1]  ?? 0);
  const riskV  = parseFloat(reason.match(/risk=([\d.]+)/)?.[1] ?? 0);
  const verbMap = { Dex: "DEX swap", Token: "token transfer", Vault: "vault deposit", Lending: "lending operation", External: "transaction" };
  const verb   = verbMap[protocol] ?? "transaction";
  const action = `${cnt} rapid ${verb}s in ${window}s`;
  let pattern;
  if (unique === 1 && same >= cnt - 1) {
    pattern = `All ${same} transactions targeting the same contract`;
  } else if (unique > 4) {
    pattern = `${unique} different targets in the same window`;
  } else {
    pattern = `${unique} target${unique > 1 ? "s" : ""} in the same window`;
  }
  return { cnt, window, unique, same, riskV, action, pattern };
}

const shortAddr = (a) => a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "—";

// ── WalletLink — with copy button ─────────────────────────────────────────────
function WalletLink({ address, short = false, onOpen, copied, onCopy }) {
  const isCopied = copied === address;
  return (
    <span className="addr-row">
      <span
        className={short ? "log-addr wallet-link" : "tc-addr wallet-link"}
        title={address}
        onClick={() => onOpen?.(address)}
      >
        {short ? `${address?.slice(0,10)}…${address?.slice(-6)}` : address}
      </span>
      <button
        className={`btn-copy-addr${isCopied ? " btn-copy-done" : ""}`}
        title={isCopied ? "Copié !" : "Copier l'adresse"}
        onClick={(e) => { e.stopPropagation(); onCopy?.(address); }}
      >
        {isCopied ? "✓" : "⧉"}
      </button>
    </span>
  );
}

function RiskGauge({ value }) {
  const pct = Math.min(100, value);
  const cls = pct >= 90 ? "gauge-critical" : pct >= 70 ? "gauge-high" : pct >= 40 ? "gauge-med" : "gauge-low";
  const lbl = pct >= 90 ? "CRITICAL" : pct >= 70 ? "HIGH" : pct >= 40 ? "MEDIUM" : "LOW";
  return (
    <div className="risk-gauge">
      <div className="gauge-bar-track">
        <div className={`gauge-bar-fill ${cls}`} style={{ width: `${pct}%` }} />
      </div>
      <div className="gauge-labels">
        <span className={`gauge-score ${cls}`}>{value}</span>
        <span className={`gauge-label ${cls}`}>{lbl}</span>
      </div>
    </div>
  );
}

function Countdown({ until, nowTs }) {
  const rem  = Math.max(0, Number(until ?? 0) - nowTs);
  const pct  = Math.min(100, Math.round((rem / BLOCK_DURATION_S) * 100));
  const mins = Math.floor(rem / 60);
  const secs = (rem % 60).toString().padStart(2, "0");
  const cls  = rem < 60 ? "cd-red" : rem < 300 ? "cd-orange" : "cd-green";
  return (
    <div className="countdown">
      <span className={`cd-time ${cls}`}>⏱ {mins}m {secs}s</span>
      <div className="cd-track">
        <div className={`cd-fill ${cls}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function AttackStrip({ item }) {
  if (!item?.attackType || item.attackType === "normal") return null;
  const isUnknown = item.attackType === "unknown_anomaly";
  const info = ATTACK_INFO[item.attackType];
  const cat  = info?.cat ?? (isUnknown ? "UNKNOWN" : null);
  const cs   = cat && CAT_COLORS[cat];
  const desc = isUnknown
    ? describeUnknown(item.reason)
    : (info?.desc ?? "Type d'attaque détecté par le classificateur");
  return (
    <div className="attack-strip" style={cs ? { background: cs.bg, borderColor: cs.border } : { background: "#f5f0ff", borderColor: "#7c3aed" }}>
      <div className="as-top">
        {cat && (
          <span className="as-cat" style={cs ? { color: cs.fg, borderColor: cs.border } : { color: "#7c3aed", borderColor: "#7c3aed" }}>{cat}</span>
        )}
        <span className="as-name" style={cs ? { color: cs.fg } : { color: "#7c3aed" }}>
          {isUnknown ? "👻 Unknown Type of Attack" : (info?.name ?? item.attackType.replace(/_/g, " "))}
        </span>
        <div className="as-meta">
          {!isUnknown && item.confidence != null && (
            <span className="as-conf">{(item.confidence * 100).toFixed(0)}% conf.</span>
          )}
          {!isUnknown && item.method && (
            <span className="as-method">
              {item.method === "classifier" ? "RF" : item.method === "iforest+clf" ? "IF+RF" : "IF"}
            </span>
          )}
          {isUnknown && <span className="as-method as-if" style={{ background: "#7c3aed", color: "#fff" }}>IsolationForest only</span>}
        </div>
      </div>
      <div className="as-desc">{desc}</div>
    </div>
  );
}

// ── Sound engine ──────────────────────────────────────────────────────────────
function playAlert(audioCtx, type) {
  if (!audioCtx) return;
  try {
    const now  = audioCtx.currentTime;
    const gain = audioCtx.createGain();
    gain.connect(audioCtx.destination);
    const osc  = audioCtx.createOscillator();
    osc.connect(gain);
    if (type === "FREEZE") {
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(880, now);
      osc.frequency.linearRampToValueAtTime(180, now + 0.7);
      gain.gain.setValueAtTime(0.25, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.7);
      osc.start(now); osc.stop(now + 0.7);
    } else if (type === "BLOCK") {
      osc.type = "square";
      osc.frequency.setValueAtTime(660, now);
      osc.frequency.setValueAtTime(440, now + 0.18);
      gain.gain.setValueAtTime(0.2, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.38);
      osc.start(now); osc.stop(now + 0.38);
    } else {
      osc.type = "sine";
      osc.frequency.setValueAtTime(880, now);
      gain.gain.setValueAtTime(0.15, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
      osc.start(now); osc.stop(now + 0.25);
    }
  } catch (_) {}
}

// ── Export helpers ────────────────────────────────────────────────────────────
function exportCSV(address, incidents) {
  const BOM = "﻿";
  const header = "Block,TxHash,Risk,Protocol,AttackType,Method,Confidence,Action\r\n";
  const rows = incidents.map(i =>
    `${i.blockNumber},"${i.txHash ?? ""}",${i.riskScore},"${i.protocol ?? ""}","${i.attackType ?? ""}","${i.method ?? ""}","${i.confidence != null ? (i.confidence * 100).toFixed(1) + "%" : ""}","${i.action ?? ""}"`
  ).join("\r\n");
  const blob = new Blob([BOM + header + rows], { type: "text/csv;charset=utf-8;" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url;
  a.download = `abis_incidents_${address.slice(2, 10)}_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function exportPDF() { window.print(); }

// ── WalletModal ───────────────────────────────────────────────────────────────
function WalletModal({ address, data, loading, onClose, copied, onCopy }) {
  useEffect(() => {
    const h = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  const statusLabel = data
    ? data.isFrozen    ? "FROZEN"
    : data.isBlockedNow ? "BLOCKED"
    : data.isWarned     ? "WARNED"
    : "CLEAR"
    : null;

  const riskTimeline = useMemo(() => {
    if (!data?.incidents?.length) return [];
    return [...data.incidents]
      .sort((a, b) => a.blockNumber - b.blockNumber)
      .map(i => ({ block: i.blockNumber, risk: i.riskScore }));
  }, [data]);

  const rep = data?.reputation ?? {};

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-header-left">
            <div className="modal-title">Wallet Detail</div>
            <div className="modal-addr-row">
              <code className="modal-addr">{address}</code>
              <button
                className={`btn-copy-addr${copied === address ? " btn-copy-done" : ""}`}
                onClick={() => onCopy?.(address)}
                title="Copier l'adresse"
              >
                {copied === address ? "✓" : "⧉"}
              </button>
            </div>
          </div>
          {statusLabel && (
            <span className={`modal-status-badge mstatus-${statusLabel.toLowerCase()}`}>
              {statusLabel}
            </span>
          )}
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        {loading && <div className="modal-loading">Chargement…</div>}

        {data && (
          <>
            <div className="modal-rep-row">
              <div className="modal-rep-item">
                <span className="modal-rep-lbl">Fois bloqué</span>
                <span className="modal-rep-val">{rep.block_count ?? 0}</span>
              </div>
              <div className="modal-rep-item">
                <span className="modal-rep-lbl">Première détection</span>
                <span className="modal-rep-val">
                  {rep.first_blocked ? new Date(rep.first_blocked * 1000).toLocaleString() : "—"}
                </span>
              </div>
              <div className="modal-rep-item">
                <span className="modal-rep-lbl">Dernière détection</span>
                <span className="modal-rep-val">
                  {rep.last_blocked ? new Date(rep.last_blocked * 1000).toLocaleString() : "—"}
                </span>
              </div>
              <div className="modal-rep-item">
                <span className="modal-rep-lbl">Total incidents</span>
                <span className="modal-rep-val">{data.incidents?.length ?? 0}</span>
              </div>
              {data.onChainReputation != null && (
                <div className="modal-rep-item">
                  <span className="modal-rep-lbl">Score on-chain</span>
                  <span className="modal-rep-val" style={{ color: "#ef4444" }}>{data.onChainReputation}</span>
                </div>
              )}
            </div>

            {riskTimeline.length >= 2 && (
              <div className="modal-chart">
                <div className="modal-section-label">Courbe de risque</div>
                <ResponsiveContainer width="100%" height={160}>
                  <LineChart data={riskTimeline}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                    <XAxis dataKey="block" stroke="#475569" tick={{ fontSize: 10 }} label={{ value: "Block", position: "insideBottom", offset: -2, fill: "#475569", fontSize: 10 }} />
                    <YAxis domain={[0, 100]} stroke="#475569" tick={{ fontSize: 10 }} />
                    <Tooltip content={<CustomTooltip />} />
                    <Line type="monotone" dataKey="risk" name="Risk" stroke="#ef4444" strokeWidth={2} dot={{ r: 3, fill: "#ef4444" }} activeDot={{ r: 5 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}

            <div className="modal-section-label">Historique complet ({data.incidents?.length ?? 0} incidents)</div>
            <div className="modal-table-wrap">
              <table className="log-table">
                <thead>
                  <tr>
                    <th>Block</th>
                    <th>Risk</th>
                    <th>Protocole</th>
                    <th>Type d'attaque</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {(data.incidents ?? []).map((inc, i) => (
                    <tr key={i} className={inc.action === "FREEZE" ? "row-ice" : ""}>
                      <td className="td-block">#{inc.blockNumber}</td>
                      <td>
                        <span className={`risk-pill ${
                          inc.riskScore >= 90 ? "rp-crit" : inc.riskScore >= 70 ? "rp-high" : "rp-med"
                        }`}>{inc.riskScore}</span>
                      </td>
                      <td>{inc.protocol ?? "—"}</td>
                      <td style={{ fontSize: "12px" }}>
                        {inc.attackType && inc.attackType !== "normal" ? (() => {
                          const info  = ATTACK_INFO[inc.attackType];
                          const isUnk = inc.attackType === "unknown_anomaly";
                          const cat   = info?.cat;
                          const cs    = cat && CAT_COLORS[cat];
                          return <span style={{ color: isUnk ? "#7c3aed" : (cs?.fg ?? "#94a3b8") }}>👻 {isUnk ? "Unknown Type of Attack" : (info?.name ?? inc.attackType.replace(/_/g, " "))}</span>;
                        })() : <span style={{ color: "#334155" }}>—</span>}
                      </td>
                      <td>
                        <span className={`action-tag ${
                          inc.action === "FREEZE" ? "at-freeze"
                          : inc.action === "BLOCK_TEMP" ? "at-block"
                          : inc.action === "BLOCK_PROTOCOL" ? "at-proto"
                          : inc.action === "WARN" ? "at-warn"
                          : "at-log"
                        }`}>{inc.action}</span>
                      </td>
                    </tr>
                  ))}
                  {!(data.incidents?.length) && (
                    <tr><td colSpan={5} style={{ textAlign: "center", color: "#475569", padding: "20px" }}>Aucun incident enregistré</td></tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="modal-export-row">
              <button className="btn-export" onClick={() => exportCSV(address, data.incidents ?? [])}>
                ⬇ Export CSV
              </button>
              <button className="btn-export btn-export-pdf" onClick={exportPDF}>
                🖨 Imprimer / PDF
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="chart-tip">
      <p className="chart-tip-lbl">{typeof label === "number" ? `Block #${label}` : label}</p>
      {payload.map((p, i) => (
        <p key={i} style={{ color: p.color }}>{p.name}: {p.value}</p>
      ))}
    </div>
  );
}

// ── Demo Tab ─────────────────────────────────────────────────────────────────
const HARDHAT_ACCOUNTS = [
  { idx: 0,  addr: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266", label: "Admin/Owner" },
  { idx: 1,  addr: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8", label: "Wallet 1" },
  { idx: 2,  addr: "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC", label: "Wallet 2" },
  { idx: 3,  addr: "0x90F79bf6EB2c4f870365E785982E1f101E93b906", label: "Wallet 3" },
  { idx: 4,  addr: "0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65", label: "Wallet 4" },
  { idx: 5,  addr: "0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc", label: "Wallet 5" },
  { idx: 6,  addr: "0x976EA74026E726554dB657fA54763abd0C3a0aa9", label: "Wallet 6" },
  { idx: 7,  addr: "0x14dC79964da2C08b23698B3D3cc7Ca32193d9955", label: "Wallet 7" },
  { idx: 8,  addr: "0x23618e81E3f5cdF7f54C3d65f7FBc0aBf5B21E8f", label: "Wallet 8" },
  { idx: 9,  addr: "0xa0Ee7A142d267C1f36714E4a8F75612F20a79720", label: "Wallet 9" },
  { idx: 10, addr: "0xBcd4042DE499D14e55001CcbB24a551F3b954096", label: "Wallet 10" },
  { idx: 11, addr: "0x71bE63f3384f5fb98995898A86B02Fb2426c5788", label: "Wallet 11" },
  { idx: 12, addr: "0xFABB0ac9d68B0B445fB7357272Ff202C5651694a", label: "Wallet 12" },
  { idx: 13, addr: "0x1CBd3b2770909D4e10f157cABC84C7264073C9Ec", label: "Wallet 13" },
  { idx: 14, addr: "0xdF3e18d64BC6A983f673Ab319CCaE4f1a57C7097", label: "Wallet 14" },
  { idx: 15, addr: "0xcd3B766CCDd6AE721141F452C550Ca635964ce71", label: "Wallet 15" },
  { idx: 16, addr: "0x2546BcD3c84621e976D8185a91A922aE77ECEc30", label: "Wallet 16" },
  { idx: 17, addr: "0xbDA5747bFD65F08deb54cb465eB87D40e51B197E", label: "Wallet 17" },
  { idx: 18, addr: "0xdD2FD4581271e230360230F9337D5c0430Bf44C0", label: "Wallet 18" },
  { idx: 19, addr: "0x8626f6940E2eb28930eFb4CeF49B2d1F2C9C1199", label: "Wallet 19" },
];

const CONTRACT_LABELS = { vault: "DemoVault", dex: "ABISDex", lending: "ABISLending", token: "ABISToken" };
const CONTRACT_COLORS = { vault: "#f59e0b", dex: "#3b82f6", lending: "#10b981", token: "#a78bfa" };
const CAT_ICONS = {
  Burst:"💥", Spray:"🌊", Prix:"📉", "Liquidité":"🏊", Lending:"🏦",
  Sybil:"👥", Draining:"🚰", Furtif:"🦊", Exploit:"🔓", MEV:"🤖",
  Inconnu:"👻",
};

function DemoTab({ api }) {
  const [attacks,         setAttacks]         = useState([]);
  const [category,        setCategory]        = useState("all");
  const [selectedId,      setSelectedId]      = useState("");
  const [attackerIdx,     setAttackerIdx]     = useState(2);
  const [targetIdx,       setTargetIdx]       = useState(10);
  const [targetContract,  setTargetContract]  = useState("vault");
  const [running,         setRunning]         = useState(false);
  const [output,          setOutput]          = useState([]);
  const termRef = useRef(null);

  const CONTRACT_ADDRS = {
    vault:   "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512",
    dex:     "0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9",
    lending: "0x0165878A594ca255338adfa4d48449f69242Eb8F",
    token:   "0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0",
  };

  const selectedAttack = attacks.find(a => a.id === selectedId);
  const categories     = useMemo(() => ["all", ...new Set(attacks.map(a => a.category))], [attacks]);
  const filtered       = category === "all" ? attacks : attacks.filter(a => a.category === category);
  const shortAddr      = addr => `${addr.slice(0, 8)}…${addr.slice(-6)}`;

  useEffect(() => {
    fetch(`${api}/attack/list`).then(r => r.json()).then(data => {
      setAttacks(data);
      if (data.length > 0) {
        setSelectedId(data[0].id);
        setAttackerIdx(data[0].default_attacker);
        setTargetIdx(data[0].default_target ?? 10);
      }
    }).catch(() => {});
  }, [api]);

  useEffect(() => {
    if (termRef.current) termRef.current.scrollTop = termRef.current.scrollHeight;
  }, [output]);

  useEffect(() => {
    if (!selectedAttack) return;
    setAttackerIdx(selectedAttack.default_attacker);
    setTargetIdx(selectedAttack.default_target ?? 10);
    setTargetContract(selectedAttack.contract ?? "vault");
  }, [selectedId]);

  const launch = async () => {
    if (!selectedId || running) return;
    setRunning(true);
    setOutput(["⏳ Connexion au nœud Hardhat..."]);
    try {
      const res = await fetch(`${api}/attack/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          attack:          selectedId,
          attacker_index:  attackerIdx,
          target_wallet:   targetIdx,
          target_contract: targetContract,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setOutput(prev => [...prev, `❌ Erreur API: ${err.detail ?? res.statusText}`]);
        setRunning(false);
        return;
      }
      const reader  = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const parts = buf.split("\n\n");
        buf = parts.pop();
        for (const part of parts) {
          const raw = part.trim();
          if (!raw.startsWith("data:")) continue;
          try {
            const d = JSON.parse(raw.slice(5).trim());
            if (d.line !== undefined) setOutput(prev => [...prev, d.line]);
            if (d.done)  setRunning(false);
            if (d.error) setOutput(prev => [...prev, `❌ ${d.error}`]);
          } catch (_) {}
        }
      }
    } catch (err) {
      setOutput(prev => [...prev, `❌ Erreur réseau: ${err.message}`]);
    }
    setRunning(false);
  };

  return (
    <div className="demo-page">

      {/* ── Left: config ── */}
      <div className="demo-config">
        <div className="demo-config-header">
          <h2 className="demo-title">⚔️ Demo Attaque</h2>
          <p className="demo-subtitle">Choisissez une attaque, configurez les wallets et observez ABIS en action</p>
        </div>

        {/* Category pills */}
        <label className="demo-label">Catégorie</label>
        <div className="demo-cat-row">
          {categories.map(c => (
            <button key={c}
              className={`demo-cat-btn${category === c ? " demo-cat-active" : ""}`}
              onClick={() => { setCategory(c); }}>
              {c === "all" ? "Toutes" : `${CAT_ICONS[c] ?? ""} ${c}`}
            </button>
          ))}
        </div>

        {/* Attack selector */}
        <label className="demo-label">Attaque ({filtered.length})</label>
        <select className="demo-select" value={selectedId}
          onChange={e => setSelectedId(e.target.value)}>
          {filtered.map(a => (
            <option key={a.id} value={a.id}>{CAT_ICONS[a.category] ?? ""} {a.label}</option>
          ))}
        </select>
        {selectedAttack && <p className="demo-desc">{selectedAttack.desc}</p>}

        {/* Badges */}
        <div className="demo-badges">
          {selectedAttack?.target_type === "contract" && selectedAttack.contract && (
            <span className="demo-badge" style={{ borderColor: CONTRACT_COLORS[selectedAttack.contract], color: CONTRACT_COLORS[selectedAttack.contract] }}>
              ◎ {CONTRACT_LABELS[selectedAttack.contract]}
            </span>
          )}
          {selectedAttack?.multi && (
            <span className="demo-badge demo-badge-multi">⚠ Multi-wallets</span>
          )}
          {selectedAttack?.target_type === "wallet" && (
            <span className="demo-badge demo-badge-wallet">→ Wallet direct</span>
          )}
        </div>

        {/* Attacker wallet */}
        <label className="demo-label">
          Wallet attaquant{selectedAttack?.multi ? " (base)" : ""}
        </label>
        <select className="demo-select" value={attackerIdx}
          onChange={e => setAttackerIdx(parseInt(e.target.value))}>
          {HARDHAT_ACCOUNTS.map(a => (
            <option key={a.idx} value={a.idx} disabled={a.idx === 0}>
              [{a.idx}] {a.label}
            </option>
          ))}
        </select>
        <div className="demo-addr">{HARDHAT_ACCOUNTS[attackerIdx]?.addr}</div>

        {/* Target — always visible, wallet or contract depending on attack type */}
        <label className="demo-label">
          {selectedAttack?.target_type === "wallet" ? "Wallet cible" : "Contrat cible"}
        </label>

        {selectedAttack?.target_type === "wallet" ? (
          <>
            <select className="demo-select" value={targetIdx}
              onChange={e => setTargetIdx(parseInt(e.target.value))}>
              {HARDHAT_ACCOUNTS.map(a => (
                <option key={a.idx} value={a.idx} disabled={a.idx === attackerIdx}>
                  [{a.idx}] {a.label}
                </option>
              ))}
            </select>
            <div className="demo-addr">{HARDHAT_ACCOUNTS[targetIdx]?.addr}</div>
          </>
        ) : (
          <>
            <select className="demo-select" value={targetContract}
              onChange={e => setTargetContract(e.target.value)}>
              <option value="vault">DemoVault — Coffre ETH</option>
              <option value="dex">ABISDex — Exchange décentralisé</option>
              <option value="lending">ABISLending — Protocole de prêt</option>
              <option value="token">ABISToken — Token ERC-20</option>
            </select>
            <div className="demo-addr" style={{ color: CONTRACT_COLORS[targetContract] }}>
              {CONTRACT_ADDRS[targetContract]}
            </div>
          </>
        )}

        <button
          className={`demo-launch-btn${running ? " demo-running" : ""}`}
          onClick={launch}
          disabled={running || !selectedId}>
          {running ? "⏳ Attaque en cours…" : "🚀 Lancer l'attaque"}
        </button>
      </div>

      {/* ── Right: terminal ── */}
      <div className="demo-terminal-wrap">
        <div className="demo-terminal-header">
          <span className="demo-term-title">
            {selectedAttack ? `${selectedAttack.label}` : "Terminal"}
          </span>
          <div className="demo-term-controls">
            <span className={`demo-term-status ${running ? "demo-term-running" : output.length ? "demo-term-done" : "demo-term-idle"}`}>
              {running ? "● EN COURS" : output.length ? "● TERMINÉ" : "● EN ATTENTE"}
            </span>
            <button className="demo-term-clear" onClick={() => setOutput([])}>✕ Effacer</button>
          </div>
        </div>
        <div className="demo-terminal" ref={termRef}>
          {output.length === 0 ? (
            <div className="demo-term-placeholder">
              <div className="demo-placeholder-icon">⚔️</div>
              <div>Lance une attaque pour voir la sortie ici</div>
              <div className="demo-placeholder-hint">Les transactions bloquées par ABIS apparaîtront en rouge</div>
            </div>
          ) : (
            output.map((line, i) => (
              <div key={i} className={`demo-term-line${
                (line.includes("BLOCKED") || line.includes("❌")) ? " tl-blocked" :
                line.includes("✅") ? " tl-ok" :
                line.includes("🔴") ? " tl-header" :
                (line.includes("⏳") || line.includes("Simul")) ? " tl-wait" :
                line.includes("⚠") ? " tl-warn" : ""
              }`}>
                <span className="tl-prefix">›</span>
                <span className="tl-content">{line}</span>
              </div>
            ))
          )}
          {running && <div className="demo-cursor">▌</div>}
        </div>

        {/* Flow diagram */}
        {selectedAttack && (
          <div className="demo-flow">
            <div className="flow-node flow-attacker">
              <div className="flow-icon">👤</div>
              <div className="flow-label">
                [{attackerIdx}] {HARDHAT_ACCOUNTS[attackerIdx]?.label}
                {selectedAttack.multi && <span className="flow-multi">+N</span>}
              </div>
              <div className="flow-addr">{shortAddr(HARDHAT_ACCOUNTS[attackerIdx]?.addr ?? "")}</div>
            </div>
            <div className="flow-arrow">⚡</div>
            <div className={`flow-node ${selectedAttack.target_type === "wallet" ? "flow-wallet" : "flow-contract"}`}>
              {selectedAttack.target_type === "wallet" ? (
                <>
                  <div className="flow-icon">👤</div>
                  <div className="flow-label">[{targetIdx}] {HARDHAT_ACCOUNTS[targetIdx]?.label}</div>
                  <div className="flow-addr">{shortAddr(HARDHAT_ACCOUNTS[targetIdx]?.addr ?? "")}</div>
                </>
              ) : (
                <>
                  <div className="flow-icon">📜</div>
                  <div className="flow-label" style={{ color: CONTRACT_COLORS[targetContract] }}>
                    {CONTRACT_LABELS[targetContract]}
                  </div>
                  <div className="flow-addr">{shortAddr(CONTRACT_ADDRS[targetContract] ?? "")}</div>
                </>
              )}
            </div>
            <div className="flow-arrow">🛡️</div>
            <div className="flow-node flow-abis">
              <div className="flow-icon">🤖</div>
              <div className="flow-label">ABIS</div>
              <div className="flow-addr">Agent ML</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Stats Tab ─────────────────────────────────────────────────────────────────
function StatsTab({ stats }) {
  const catAgg = useMemo(() => {
    if (!stats?.attackTypeDistribution) return [];
    const agg = {};
    for (const { type, count } of stats.attackTypeDistribution) {
      const cat = ATTACK_INFO[type]?.cat ?? "OTHER";
      agg[cat] = (agg[cat] || 0) + count;
    }
    return Object.entries(agg)
      .map(([cat, count]) => ({ cat, count }))
      .sort((a, b) => b.count - a.count);
  }, [stats]);

  const PIE_FG = Object.fromEntries(Object.entries(CAT_COLORS).map(([k, v]) => [k, v.fg]));

  if (!stats) {
    return (
      <div className="empty-state" style={{ marginTop: 24 }}>
        <div className="empty-icon">📊</div>
        <div className="empty-text">No statistics yet — generate some incidents first</div>
      </div>
    );
  }

  const total = Object.values(stats.riskBuckets ?? {}).reduce((a, b) => a + b, 0);

  return (
    <div className="stats-page">
      {/* Risk severity buckets */}
      <div className="stats-buckets">
        {[
          { k: "critical", label: "Critical", color: "#ef4444", icon: "🔴" },
          { k: "high",     label: "High",     color: "#f97316", icon: "🟠" },
          { k: "medium",   label: "Medium",   color: "#f59e0b", icon: "🟡" },
          { k: "low",      label: "Low",      color: "#22c55e", icon: "🟢" },
        ].map(b => {
          const v   = stats.riskBuckets?.[b.k] ?? 0;
          const pct = total > 0 ? ((v / total) * 100).toFixed(1) : 0;
          return (
            <div className="stat-bucket" key={b.k} style={{ "--sb-color": b.color }}>
              <div className="sb-icon">{b.icon}</div>
              <div className="sb-val" style={{ color: b.color }}>{v}</div>
              <div className="sb-lbl">{b.label} Risk</div>
              <div className="sb-pct" style={{ color: b.color }}>{pct}%</div>
              <div className="sb-bar-track">
                <div className="sb-bar-fill" style={{ width: `${pct}%`, background: b.color }} />
              </div>
            </div>
          );
        })}
      </div>

      <div className="stats-row-2">
        {/* Attack category pie */}
        <div className="chart-panel">
          <h3>Attack Categories Distribution</h3>
          {catAgg.length === 0 ? (
            <div className="empty-state" style={{ height: 260 }}><div className="empty-text">No data</div></div>
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie
                  data={catAgg}
                  dataKey="count"
                  nameKey="cat"
                  cx="50%" cy="50%"
                  outerRadius={100}
                  label={({ cat, percent }) =>
                    percent > 0.04 ? `${cat} ${(percent * 100).toFixed(0)}%` : ""
                  }
                  labelLine={false}
                >
                  {catAgg.map((entry, i) => (
                    <Cell key={i} fill={PIE_FG[entry.cat] ?? "#64748b"} />
                  ))}
                </Pie>
                <Tooltip formatter={(v, n) => [v, n]} contentStyle={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 8 }} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Protocol incidents bar */}
        <div className="chart-panel">
          <h3>Incidents by Protocol</h3>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={stats.protocolDistribution ?? []} layout="vertical" margin={{ left: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" horizontal={false} />
              <XAxis type="number" stroke="#475569" tick={{ fontSize: 10 }} />
              <YAxis type="category" dataKey="protocol" stroke="#475569" tick={{ fontSize: 11 }} width={70} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="count" name="Incidents" fill="#3b82f6" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="stats-row-2">
        {/* Action distribution */}
        <div className="chart-panel">
          <h3>Actions Taken by ABIS</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={stats.actionDistribution ?? []}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis dataKey="action" stroke="#475569" tick={{ fontSize: 10 }} />
              <YAxis stroke="#475569" tick={{ fontSize: 10 }} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="count" name="Count" radius={[4, 4, 0, 0]}>
                {(stats.actionDistribution ?? []).map((entry, i) => {
                  const colMap = { FREEZE: "#a78bfa", BLOCK_TEMP: "#ef4444", BLOCK_PROTOCOL: "#f97316", WARN: "#f59e0b" };
                  return <Cell key={i} fill={colMap[entry.action] ?? "#3b82f6"} />;
                })}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Top wallets */}
        <div className="chart-panel">
          <h3>Top Wallets by Incident Count</h3>
          <div className="log-table-wrap">
            <table className="log-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Wallet</th>
                  <th>Incidents</th>
                  <th>Max Risk</th>
                </tr>
              </thead>
              <tbody>
                {(stats.topWallets ?? []).slice(0, 8).map((w, i) => (
                  <tr key={i}>
                    <td className="td-block">{i + 1}</td>
                    <td><span className="log-addr">{w.wallet.slice(0,10)}…{w.wallet.slice(-6)}</span></td>
                    <td><span className="risk-pill rp-med">{w.count}</span></td>
                    <td>
                      <span className={`risk-pill ${w.maxRisk >= 90 ? "rp-crit" : w.maxRisk >= 70 ? "rp-high" : "rp-med"}`}>
                        {w.maxRisk}
                      </span>
                    </td>
                  </tr>
                ))}
                {!(stats.topWallets?.length) && (
                  <tr><td colSpan={4} style={{ textAlign: "center", color: "#475569", padding: "20px" }}>Aucune donnée</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Attack type full table */}
      {(stats.attackTypeDistribution?.length ?? 0) > 0 && (
        <div className="chart-panel" style={{ marginTop: 14 }}>
          <h3>Attack Type Breakdown</h3>
          <div className="log-table-wrap">
            <table className="log-table">
              <thead>
                <tr>
                  <th>Category</th>
                  <th>Attack Type</th>
                  <th>Count</th>
                </tr>
              </thead>
              <tbody>
                {stats.attackTypeDistribution.map((row, i) => {
                  const info = ATTACK_INFO[row.type];
                  const cat  = info?.cat;
                  const cs   = cat && CAT_COLORS[cat];
                  return (
                    <tr key={i}>
                      <td>
                        {cs && <span className="log-atk-cat" style={{ background: cs.bg, color: cs.fg, borderColor: cs.border }}>{cat}</span>}
                      </td>
                      <td>
                        <span style={{ color: cs?.fg ?? "#94a3b8", fontSize: 13, fontWeight: 600 }}>
                          {info?.name ?? row.type.replace(/_/g, " ")}
                        </span>
                      </td>
                      <td><span className="risk-pill rp-med">{row.count}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Config Tab ─────────────────────────────────────────────────────────────────
function ConfigTab({ circuitBreakerPaused, onToggleCB, cbLoading, whitelist, onAddWL, onRemoveWL, wlLoading, health, showFlash }) {
  const [newAddr, setNewAddr] = useState("");

  function handleAdd() {
    const addr = newAddr.trim();
    if (!addr) return;
    if (!/^0x[a-fA-F0-9]{40}$/.test(addr)) {
      showFlash("Invalid Ethereum address format", "error");
      return;
    }
    onAddWL(addr);
    setNewAddr("");
  }

  return (
    <div className="config-page">
      {/* System Health */}
      <section className="section">
        <div className="section-head"><h2>System Health</h2></div>
        <div className="config-health-grid">
          <div className="health-item">
            <span className={`health-dot ${health?.blockchain ? "h-ok" : "h-err"}`} />
            <span className="health-lbl">Blockchain {health?.blockchain ? "Connected" : "Disconnected"}</span>
          </div>
          <div className="health-item">
            <span className={`health-dot ${health?.database ? "h-ok" : "h-err"}`} />
            <span className="health-lbl">SQLite Cache {health?.database ? "OK" : "Error"}</span>
          </div>
          <div className="health-item">
            <span className="health-dot h-ok" />
            <span className="health-lbl">API v{health?.version ?? "4.0.0"}</span>
          </div>
          <div className="health-item">
            <span className="health-dot h-ok" />
            <span className="health-lbl">Block #{health?.latest_block ?? "—"}</span>
          </div>
        </div>
        {health?.registry && (
          <div className="config-addr-row">
            <span className="config-addr-lbl">Registry Contract</span>
            <code className="config-code">{health.registry}</code>
          </div>
        )}
      </section>

      {/* Circuit Breaker */}
      <section className="section">
        <div className="section-head">
          <h2>Circuit Breaker</h2>
          <span className="section-note">Suspend all ABIS enforcement globally</span>
        </div>
        <div className="cb-card">
          <div className="cb-status-block">
            <div className={`cb-indicator ${circuitBreakerPaused ? "cb-paused" : "cb-active"}`}>
              <div className={`cb-dot ${circuitBreakerPaused ? "cb-dot-paused" : "cb-dot-active"}`} />
              <div>
                <div className="cb-status-title">
                  {circuitBreakerPaused ? "PAUSED" : "ACTIVE"}
                </div>
                <div className="cb-status-desc">
                  {circuitBreakerPaused
                    ? "Enforcement suspended — all wallets can transact freely"
                    : "All graduated enforcement levels active and protecting protocols"}
                </div>
              </div>
            </div>
          </div>
          <button
            className={`btn-cb ${circuitBreakerPaused ? "btn-cb-resume" : "btn-cb-pause"}`}
            onClick={onToggleCB}
            disabled={cbLoading}
          >
            {cbLoading ? "Processing…" : circuitBreakerPaused ? "▶ Resume Enforcement" : "⏸ Pause Enforcement"}
          </button>
        </div>
      </section>

      {/* Whitelist */}
      <section className="section">
        <div className="section-head">
          <h2>Whitelist Management</h2>
          <span className="section-note">Whitelisted wallets bypass all enforcement permanently</span>
        </div>
        <div className="wl-add-row">
          <input
            className="wl-input"
            placeholder="0x... Ethereum wallet address"
            value={newAddr}
            onChange={e => setNewAddr(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleAdd()}
            spellCheck={false}
          />
          <button className="btn-wl-add" onClick={handleAdd} disabled={wlLoading}>
            {wlLoading ? "Adding…" : "+ Add to Whitelist"}
          </button>
        </div>
        {whitelist.length === 0 ? (
          <div className="empty-state" style={{ marginTop: 12 }}>
            <div className="empty-icon">🔓</div>
            <div className="empty-text">No whitelisted wallets — all wallets are subject to enforcement</div>
          </div>
        ) : (
          <div className="wl-list">
            {whitelist.map((w, i) => (
              <div className="wl-item" key={i}>
                <span className="wl-badge">TRUSTED</span>
                <code className="wl-addr">{w.wallet}</code>
                <button className="btn-wl-remove" onClick={() => onRemoveWL(w.wallet)} disabled={wlLoading}>
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Keyboard shortcuts */}
      <section className="section">
        <div className="section-head"><h2>Keyboard Shortcuts</h2></div>
        <div className="shortcuts-grid">
          {[
            { key: "D", desc: "Toggle dark/light mode" },
            { key: "R", desc: "Refresh dashboard data" },
            { key: "Esc", desc: "Close modal / clear search" },
            { key: "S", desc: "Go to Statistics tab" },
            { key: "C", desc: "Go to Configuration tab" },
            { key: "1", desc: "Go to Dashboard tab" },
          ].map(s => (
            <div className="shortcut-item" key={s.key}>
              <kbd className="kbd">{s.key}</kbd>
              <span className="shortcut-desc">{s.desc}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

// ── Main App ──────────────────────────────────────────────────────────────────
export default function App() {
  const [status,         setStatus]         = useState(null);
  const [metrics,        setMetrics]        = useState(null);
  const [incidents,      setIncidents]      = useState([]);
  const [blocked,        setBlocked]        = useState([]);
  const [frozen,         setFrozen]         = useState([]);
  const [warned,         setWarned]         = useState([]);
  const [protoBlocks,    setProtoBlocks]    = useState([]);
  const [history,        setHistory]        = useState([]);
  const [timeline,       setTimeline]       = useState([]);
  const [protocols,      setProtocols]      = useState([]);
  const [flash,          setFlash]          = useState(null);
  const [loading,        setLoading]        = useState("");
  const [search,         setSearch]         = useState("");
  const [showHistory,    setShowHistory]    = useState(true);
  const [nowTs,          setNowTs]          = useState(Math.floor(Date.now() / 1000));

  // Phase 4 — new state
  const [darkMode,       setDarkMode]       = useState(true);
  const [activeTab,      setActiveTab]      = useState("dashboard");
  const [filterAction,   setFilterAction]   = useState("");
  const [filterAttack,   setFilterAttack]   = useState("");
  const [stats,          setStats]          = useState(null);
  const [whitelist,      setWhitelist]      = useState([]);
  const [cbPaused,       setCbPaused]       = useState(false);
  const [cbLoading,      setCbLoading]      = useState(false);
  const [wlLoading,      setWlLoading]      = useState(false);
  const [health,         setHealth]         = useState(null);
  const [notifEnabled,   setNotifEnabled]   = useState(false);
  const [copied,         setCopied]         = useState(null);
  const [soundOn,        setSoundOn]        = useState(true);
  const [alertFlash,     setAlertFlash]     = useState(null);
  const [walletModal,    setWalletModal]    = useState(null);
  const [modalLoading,   setModalLoading]   = useState(false);

  const soundOnRef       = useRef(true);
  const audioCtxRef      = useRef(null);
  const prevMetricsRef   = useRef(null);
  const isInitialLoad    = useRef(true);
  const notifRef         = useRef(false);

  const showFlash = (msg, type = "info") => {
    setFlash({ msg, type });
    setTimeout(() => setFlash(null), 4000);
  };

  function getAudioCtx() {
    if (!audioCtxRef.current) {
      audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtxRef.current.state === "suspended") audioCtxRef.current.resume();
    return audioCtxRef.current;
  }

  function triggerAlert(type) {
    if (soundOnRef.current) playAlert(getAudioCtx(), type);
    setAlertFlash({ type });
    setTimeout(() => setAlertFlash(null), 3500);
    if (notifRef.current) {
      const titles = { FREEZE: "🧊 Wallet Frozen!", BLOCK: "🔒 Wallet Blocked!", WARN: "⚠️ Wallet Warned!" };
      const bodies = { FREEZE: "A wallet was permanently frozen by ABIS.", BLOCK: "A wallet was blocked by ABIS.", WARN: "A wallet received a rate-limit warning." };
      try { new Notification(titles[type] ?? "ABIS Alert", { body: bodies[type] ?? "", icon: "/favicon.ico" }); } catch (_) {}
    }
  }

  function copyAddr(address) {
    navigator.clipboard.writeText(address).then(() => {
      setCopied(address);
      setTimeout(() => setCopied(null), 2000);
    }).catch(() => showFlash("Clipboard not available", "error"));
  }

  function requestNotif() {
    if (!("Notification" in window)) { showFlash("Browser notifications not supported", "error"); return; }
    Notification.requestPermission().then(p => {
      const ok = p === "granted";
      setNotifEnabled(ok);
      notifRef.current = ok;
      showFlash(ok ? "Browser notifications enabled" : "Notifications denied", ok ? "success" : "error");
    });
  }

  async function openWallet(address) {
    if (!address) return;
    setWalletModal({ address, data: null });
    setModalLoading(true);
    try {
      const data = await fetch(`${API}/wallet/${address}`).then(r => r.json());
      setWalletModal({ address, data });
    } catch {
      showFlash("Impossible de charger les données du wallet", "error");
      setWalletModal(null);
    } finally {
      setModalLoading(false);
    }
  }

  const load = useCallback(async () => {
    try {
      const [s, m, i, b, fr, w, pb, h, t, p] = await Promise.all([
        fetch(`${API}/status`).then(r => r.json()),
        fetch(`${API}/metrics`).then(r => r.json()),
        fetch(`${API}/incidents?limit=50`).then(r => r.json()),
        fetch(`${API}/blocked-wallets`).then(r => r.json()),
        fetch(`${API}/frozen-wallets`).then(r => r.json()),
        fetch(`${API}/warned-wallets`).then(r => r.json()),
        fetch(`${API}/protocol-blocks`).then(r => r.json()),
        fetch(`${API}/blocked-history?limit=50`).then(r => r.json()),
        fetch(`${API}/timeline?limit=80`).then(r => r.json()),
        fetch(`${API}/protocols`).then(r => r.json()),
      ]);
      setStatus(s); setMetrics(m);
      setIncidents(Array.isArray(i) ? i : []);
      setBlocked(Array.isArray(b) ? b : []);
      setFrozen(Array.isArray(fr) ? fr : []);
      setWarned(Array.isArray(w) ? w : []);
      setProtoBlocks(Array.isArray(pb) ? pb : []);
      setHistory(Array.isArray(h) ? h : []);
      setTimeline(Array.isArray(t) ? t : []);
      setProtocols(Array.isArray(p) ? p : []);

      if (!isInitialLoad.current && prevMetricsRef.current) {
        const prev = prevMetricsRef.current;
        if ((m.frozenCount  ?? 0) > (prev.frozenCount  ?? 0)) triggerAlert("FREEZE");
        else if ((m.blockedCount ?? 0) > (prev.blockedCount ?? 0)) triggerAlert("BLOCK");
        else if ((m.protocolBlockCount ?? 0) > (prev.protocolBlockCount ?? 0)) triggerAlert("BLOCK");
        else if ((m.warnedCount  ?? 0) > (prev.warnedCount  ?? 0)) triggerAlert("WARN");
      }
      if (isInitialLoad.current) isInitialLoad.current = false;
      prevMetricsRef.current = m;
    } catch { showFlash("Cannot reach ABIS API", "error"); }
  }, []);

  // Polling
  useEffect(() => {
    load();
    const r = setInterval(load, 5000);
    const c = setInterval(() => setNowTs(Math.floor(Date.now() / 1000)), 1000);
    return () => { clearInterval(r); clearInterval(c); };
  }, [load]);

  // SSE — real-time push updates
  useEffect(() => {
    let es;
    try {
      es = new EventSource(`${API}/events/stream`);
      es.addEventListener("metrics", (e) => {
        try { setMetrics(JSON.parse(e.data)); } catch (_) {}
      });
      es.addEventListener("new_incidents", () => { load(); });
      es.onerror = () => { es.close(); };
    } catch (_) {}
    return () => { if (es) es.close(); };
  }, [load]);

  // Health check
  useEffect(() => {
    fetch(`${API}/health`).then(r => r.json()).then(setHealth).catch(() => {});
  }, []);

  // Circuit breaker status
  useEffect(() => {
    fetch(`${API}/circuit-breaker`).then(r => r.json()).then(d => setCbPaused(d.paused ?? false)).catch(() => {});
  }, []);

  // Whitelist
  useEffect(() => {
    fetch(`${API}/whitelist`).then(r => r.json()).then(d => setWhitelist(Array.isArray(d) ? d : [])).catch(() => {});
  }, []);

  // Stats (load on tab switch)
  useEffect(() => {
    if (activeTab === "stats") {
      fetch(`${API}/stats`).then(r => r.json()).then(setStats).catch(() => {});
    }
  }, [activeTab]);

  // Keyboard shortcuts
  useEffect(() => {
    function onKey(e) {
      if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;
      if (e.key === "Escape") {
        if (walletModal) setWalletModal(null);
        else setSearch("");
      }
      if (e.key === "d" || e.key === "D") setDarkMode(v => !v);
      if (e.key === "r" || e.key === "R") load();
      if (e.key === "s" || e.key === "S") setActiveTab("stats");
      if (e.key === "c" || e.key === "C") setActiveTab("config");
      if (e.key === "a" || e.key === "A") setActiveTab("demo");
      if (e.key === "1") setActiveTab("dashboard");
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [walletModal, load]);

  // Computed data
  const blockedLive = useMemo(() =>
    blocked.map(x => ({ ...x, liveRem: Math.max(0, Number(x.until ?? 0) - nowTs) })).filter(x => x.liveRem > 0),
  [blocked, nowTs]);

  const expiredBlocks = useMemo(() => {
    const activeAddrs = new Set(blockedLive.map(x => x.wallet.toLowerCase()));
    return history.filter(x => !x.isBlockedNow && !x.isFrozen && !activeAddrs.has(x.wallet.toLowerCase()));
  }, [history, blockedLive]);

  const protoMap = useMemo(() => {
    const m = {};
    protocols.forEach(p => { m[p.key] = p; });
    return m;
  }, [protocols]);

  const chartData = useMemo(() => {
    const g = {};
    timeline.forEach(e => {
      if (!g[e.block]) g[e.block] = { block: e.block, risk: 0, count: 0 };
      g[e.block].risk  = Math.max(g[e.block].risk, e.risk);
      g[e.block].count += 1;
    });
    return Object.values(g).sort((a, b) => a.block - b.block);
  }, [timeline]);

  // Filtering
  function filterItems(arr) {
    return arr.filter(x => {
      if (search.trim()) {
        const s = search.toLowerCase();
        if (!x.wallet?.toLowerCase().includes(s) && !x.protocol?.toLowerCase().includes(s)) return false;
      }
      return true;
    });
  }

  function filterIncidents(arr) {
    return arr.filter(x => {
      if (search.trim()) {
        const s = search.toLowerCase();
        if (!x.wallet?.toLowerCase().includes(s) && !x.protocol?.toLowerCase().includes(s)) return false;
      }
      if (filterAction && x.action !== filterAction) return false;
      if (filterAttack && x.attackType !== filterAttack) return false;
      return true;
    });
  }

  async function doAction(wallet, endpoint = "unblock") {
    setLoading(wallet);
    try {
      const res  = await fetch(`${API}/${endpoint}/${wallet}`, { method: "POST" });
      const data = await res.json();
      showFlash(data.message ?? "Done", res.ok ? "success" : "error");
      await load();
    } catch { showFlash("Request failed", "error"); }
    finally  { setLoading(""); }
  }

  async function toggleCB() {
    setCbLoading(true);
    try {
      const action = cbPaused ? "unpause" : "pause";
      const res = await fetch(`${API}/circuit-breaker/${action}`, { method: "POST" });
      const d   = await res.json();
      if (d.success) {
        setCbPaused(d.paused);
        showFlash(`Enforcement ${d.paused ? "paused" : "resumed"}`, "success");
      }
    } catch { showFlash("Circuit breaker request failed", "error"); }
    finally  { setCbLoading(false); }
  }

  async function addToWhitelist(addr) {
    setWlLoading(true);
    try {
      const res = await fetch(`${API}/whitelist/${addr}`, { method: "POST" });
      const d   = await res.json();
      if (d.success) {
        showFlash(`${addr.slice(0,10)}… added to whitelist`, "success");
        const updated = await fetch(`${API}/whitelist`).then(r => r.json());
        setWhitelist(Array.isArray(updated) ? updated : []);
      } else {
        showFlash(d.detail ?? "Failed", "error");
      }
    } catch { showFlash("Whitelist request failed", "error"); }
    finally  { setWlLoading(false); }
  }

  async function removeFromWhitelist(addr) {
    setWlLoading(true);
    try {
      const res = await fetch(`${API}/whitelist/${addr}`, { method: "DELETE" });
      const d   = await res.json();
      if (d.success) {
        showFlash(`${addr.slice(0,10)}… removed from whitelist`, "success");
        setWhitelist(wl => wl.filter(w => w.wallet.toLowerCase() !== addr.toLowerCase()));
      } else {
        showFlash(d.detail ?? "Failed", "error");
      }
    } catch { showFlash("Whitelist request failed", "error"); }
    finally  { setWlLoading(false); }
  }

  const guardProtos = protocols.filter(p => p.type !== "registry");

  const uniqueAttackTypes = useMemo(() =>
    [...new Set(incidents.filter(i => i.attackType && i.attackType !== "normal").map(i => i.attackType))].sort(),
  [incidents]);

  return (
    <div className={`app${darkMode ? "" : " light"}`}>

      {/* ── TOP BAR ── */}
      <div className="topbar">
        <div className="topbar-brand">
          <span className="topbar-shield">🛡</span>
          <div>
            <div className="topbar-title">ABIS</div>
            <div className="topbar-sub">AI-Driven Blockchain Immune System</div>
          </div>
        </div>

        {/* Tab navigation */}
        <div className="tab-nav">
          {[
            { key: "dashboard", label: "Dashboard",     icon: "📊" },
            { key: "stats",     label: "Statistics",    icon: "📈" },
            { key: "config",    label: "Configuration", icon: "⚙️" },
            { key: "demo",      label: "Demo Attack",   icon: "⚔️" },
          ].map(t => (
            <button
              key={t.key}
              className={`tab-btn${activeTab === t.key ? " tab-active" : ""}`}
              onClick={() => setActiveTab(t.key)}
            >
              {t.icon} {t.label}
            </button>
          ))}
        </div>

        <div className="topbar-right">
          <div className={`live-dot ${status?.connected ? "live-on" : "live-off"}`} />
          <span className={status?.connected ? "live-text-on" : "live-text-off"}>
            {status?.connected ? "LIVE" : "OFFLINE"}
          </span>
          <div className="topbar-block">Block <strong>#{status?.latest_block ?? "—"}</strong></div>
          {cbPaused && <span className="topbar-paused">⏸ PAUSED</span>}
          <button
            className={`btn-mute${notifEnabled ? " btn-mute-on" : ""}`}
            title={notifEnabled ? "Browser notifications enabled" : "Enable browser notifications"}
            onClick={requestNotif}
          >🔔</button>
          <button
            className={`btn-mute${soundOn ? "" : " btn-mute-off"}`}
            title={soundOn ? "Mute alerts" : "Unmute alerts"}
            onClick={() => {
              getAudioCtx();
              setSoundOn(v => { const n = !v; soundOnRef.current = n; return n; });
            }}
          >
            {soundOn ? "🔊" : "🔇"}
          </button>
          <button
            className="btn-mute"
            title="Toggle dark/light mode (D)"
            onClick={() => setDarkMode(v => !v)}
          >
            {darkMode ? "☀️" : "🌙"}
          </button>
        </div>
      </div>

      <div className="page">

        {/* ── Flash ── */}
        {flash && <div className={`flash flash-${flash.type}`}>{flash.msg}</div>}

        {/* ── Alert flash (visual) ── */}
        {alertFlash && (
          <div className={`alert-flash alert-flash-${alertFlash.type.toLowerCase()}`}>
            {alertFlash.type === "FREEZE" ? "🧊 WALLET FROZEN — menace critique détectée"
              : alertFlash.type === "BLOCK" ? "🔒 WALLET BLOQUÉ — attaque détectée"
              : "⚠️ WALLET AVERTI — activité suspecte"}
          </div>
        )}

        {/* ══════════════ DASHBOARD TAB ══════════════ */}
        {activeTab === "dashboard" && (
          <>
            {/* KPI row */}
            <div className="kpi-row">
              {[
                { label: "Total Incidents",  val: metrics?.incidentCount      ?? 0, icon: "📋", accent: "#3b82f6" },
                { label: "Warned Now",        val: metrics?.warnedCount        ?? 0, icon: "⚠️", accent: "#f59e0b" },
                { label: "Protocol Blocked", val: metrics?.protocolBlockCount  ?? 0, icon: "🚫", accent: "#ef4444" },
                { label: "Globally Blocked", val: metrics?.blockedCount        ?? 0, icon: "🔒", accent: "#dc2626" },
                { label: "Frozen",           val: metrics?.frozenCount         ?? 0, icon: "🧊", accent: "#7c3aed" },
                { label: "Released",         val: metrics?.unblockedCount      ?? 0, icon: "✅", accent: "#22c55e" },
              ].map(k => (
                <div className="kpi" key={k.label} style={{ "--accent": k.accent }}>
                  <span className="kpi-icon">{k.icon}</span>
                  <div className="kpi-num">{k.val}</div>
                  <div className="kpi-lbl">{k.label}</div>
                </div>
              ))}
            </div>

            {/* Protected network */}
            <section className="section">
              <div className="section-head">
                <h2>Protected Network</h2>
                <span className="section-note">Graduated enforcement: Warn → Protocol-block → Global-block → Freeze</span>
              </div>
              <div className="proto-grid">
                {guardProtos.map(p => {
                  const c = cfg(p.name?.replace("ABIS", "").replace("Demo", ""));
                  return (
                    <div className="proto-card" key={p.key} style={{ "--pc": c.color, "--pb": c.bg }}>
                      <div className="proto-icon">{c.icon}</div>
                      <div className="proto-name">{p.name}</div>
                      <div className="proto-type">{p.type?.toUpperCase()}</div>
                      <div className="proto-addr" title={p.address}>{shortAddr(p.address)}</div>
                      <div className={`proto-status ${p.connected ? "ps-on" : "ps-off"}`}>
                        {p.connected ? "● PROTECTED" : "○ OFFLINE"}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>

            {/* Charts */}
            <div className="charts-row">
              <div className="chart-panel">
                <h3>Risk Timeline</h3>
                <ResponsiveContainer width="100%" height={200}>
                  <AreaChart data={chartData}>
                    <defs>
                      <linearGradient id="rg" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%"  stopColor="#ef4444" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                    <XAxis dataKey="block" stroke="#475569" tick={{ fontSize: 10 }} />
                    <YAxis domain={[0, 100]} stroke="#475569" tick={{ fontSize: 10 }} />
                    <Tooltip content={<CustomTooltip />} />
                    <Area type="monotone" dataKey="risk" name="Risk" stroke="#ef4444" fill="url(#rg)" strokeWidth={2} dot={false} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
              <div className="chart-panel">
                <h3>Incidents per Block</h3>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                    <XAxis dataKey="block" stroke="#475569" tick={{ fontSize: 10 }} />
                    <YAxis stroke="#475569" tick={{ fontSize: 10 }} />
                    <Tooltip content={<CustomTooltip />} />
                    <Bar dataKey="count" name="Incidents" fill="#3b82f6" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Search + filters */}
            <div className="filter-row">
              <div className="searchbox">
                <span className="search-icon">🔍</span>
                <input
                  placeholder="Filter by wallet or protocol…"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                />
                {search && <button className="search-clear" onClick={() => setSearch("")}>✕</button>}
              </div>
              <select
                className="filter-select"
                value={filterAction}
                onChange={e => setFilterAction(e.target.value)}
                title="Filter by action"
              >
                <option value="">All actions</option>
                <option value="WARN">WARN</option>
                <option value="BLOCK_TEMP">BLOCK_TEMP</option>
                <option value="BLOCK_PROTOCOL">BLOCK_PROTOCOL</option>
                <option value="FREEZE">FREEZE</option>
              </select>
              <select
                className="filter-select"
                value={filterAttack}
                onChange={e => setFilterAttack(e.target.value)}
                title="Filter by attack type"
              >
                <option value="">All attack types</option>
                {uniqueAttackTypes.map(t => {
                  const info = ATTACK_INFO[t];
                  return <option key={t} value={t}>{info?.name ?? t.replace(/_/g, " ")}</option>;
                })}
              </select>
              {(filterAction || filterAttack) && (
                <button className="search-clear btn-clear-filters" onClick={() => { setFilterAction(""); setFilterAttack(""); }}>
                  ✕ Clear filters
                </button>
              )}
            </div>

            {/* WARNED WALLETS */}
            {filterItems(warned).length > 0 && (
              <section className="section section-warned">
                <div className="section-head">
                  <h2>⚠️ Warned Wallets <span className="history-count">{filterItems(warned).length} active</span></h2>
                  <span className="section-note warn-note">Rate-limited — transactions slowed down</span>
                </div>
                <div className="threat-list">
                  {filterItems(warned).map((item, idx) => {
                    const attack = parseAttack(item.reason, item.protocol);
                    const pcfg   = cfg(item.protocol);
                    const rem    = item.warnSecondsRemaining ?? 0;
                    const mins   = Math.floor(rem / 60);
                    const secs   = (rem % 60).toString().padStart(2, "0");
                    return (
                      <div className="threat-card threat-card-warn" key={idx}>
                        <div className="tc-header">
                          <div className="tc-addr-block">
                            <span className="tc-tag tc-tag-warn">WARNED</span>
                            <WalletLink address={item.wallet} onOpen={openWallet} copied={copied} onCopy={copyAddr} />
                          </div>
                          <RiskGauge value={item.riskScore} />
                        </div>
                        <AttackStrip item={item} />
                        <div className="tc-body">
                          <div className="tc-col">
                            <div className="tc-col-label">⚡ Suspicious activity</div>
                            <div className="tc-action">{attack.action}</div>
                            <div className="tc-pattern">{attack.pattern}</div>
                            <div className="tc-block-info">Detected at block #{item.blockNumber}</div>
                          </div>
                          <div className="tc-divider" />
                          <div className="tc-col">
                            <div className="tc-col-label">🐢 Rate limit applied</div>
                            <div className="warn-delay-badge">Min {item.txDelay}s between transactions</div>
                            <div className="tc-col-label" style={{marginTop:8}}>⏱ Warning expires in</div>
                            <div className="tc-action" style={{color:"#f59e0b"}}>{mins}m {secs}s</div>
                            <div className="tc-col-label" style={{marginTop:8}}>🎯 Suspicious protocol</div>
                            <div className="tc-target-name" style={{ color: pcfg.color }}>{pcfg.icon} {pcfg.label}</div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            {/* PROTOCOL BLOCKS */}
            {filterItems(protoBlocks).length > 0 && (
              <section className="section section-proto-block">
                <div className="section-head">
                  <h2>🚫 Protocol-Specific Blocks <span className="history-count">{filterItems(protoBlocks).length} active</span></h2>
                  <span className="section-note">Blocked on one protocol only</span>
                </div>
                <div className="threat-list">
                  {filterItems(protoBlocks).map((item, idx) => {
                    const protoInfo = protocols.find(p => p.address?.toLowerCase() === item.protocol?.toLowerCase());
                    const protoKey  = protoInfo?.name?.replace("ABIS", "").replace("Demo", "") ?? "External";
                    const pcfg      = cfg(protoKey);
                    const rem  = item.secondsRemaining ?? 0;
                    const mins = Math.floor(rem / 60);
                    const secs = (rem % 60).toString().padStart(2, "0");
                    return (
                      <div className="threat-card threat-card-proto" key={idx}>
                        <div className="tc-header">
                          <div className="tc-addr-block">
                            <span className="tc-tag tc-tag-proto">PROTO-BLOCK</span>
                            <WalletLink address={item.wallet} onOpen={openWallet} copied={copied} onCopy={copyAddr} />
                          </div>
                          <RiskGauge value={item.riskScore} />
                        </div>
                        <AttackStrip item={item} />
                        <div className="tc-body">
                          <div className="tc-col">
                            <div className="tc-col-label">🎯 Bloqué sur le protocole</div>
                            <div className="tc-target-name" style={{ color: pcfg.color }}>{pcfg.icon} {pcfg.label}</div>
                            <div className="tc-target-addr" title={item.protocol}>{item.protocol}</div>
                            <div className="tc-block-info">Détecté au bloc #{item.blockNumber}</div>
                          </div>
                          <div className="tc-divider" />
                          <div className="tc-col">
                            <div className="tc-col-label">⏱ Blocage expire dans</div>
                            <div className="tc-action" style={{color:"#ef4444"}}>{mins}m {secs}s</div>
                            <div className="tc-col-label" style={{marginTop:8}}>✅ Autres protocoles</div>
                            <div className="tc-pattern">Vault, Token, Lending non-affectés</div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            {/* ACTIVE THREATS */}
            <section className="section">
              <div className="section-head">
                <h2 className="threat-title">
                  {blockedLive.length > 0 && <span className="pulse-dot" />}
                  Active Threats
                </h2>
                <span className="threat-count">{filterItems(blockedLive).length} wallet{filterItems(blockedLive).length !== 1 ? "s" : ""} blocked</span>
              </div>
              {filterItems(blockedLive).length === 0 ? (
                <div className="empty-state">
                  <div className="empty-icon">✅</div>
                  <div className="empty-text">No active threats — network is secure</div>
                </div>
              ) : (
                <div className="threat-list">
                  {filterItems(blockedLive).map((item, idx) => {
                    const attack = parseAttack(item.reason, item.protocol);
                    const pcfg   = cfg(item.protocol);
                    const target = protoMap[item.protocol?.toLowerCase()];
                    return (
                      <div className="threat-card" key={idx}>
                        <div className="tc-header">
                          <div className="tc-addr-block">
                            <span className="tc-tag">ATTACKER</span>
                            <WalletLink address={item.wallet} onOpen={openWallet} copied={copied} onCopy={copyAddr} />
                          </div>
                          <RiskGauge value={item.riskScore} />
                        </div>
                        <AttackStrip item={item} />
                        <div className="tc-body">
                          <div className="tc-col">
                            <div className="tc-col-label">⚡ What they did</div>
                            <div className="tc-action">{attack.action}</div>
                            <div className="tc-pattern">{attack.pattern}</div>
                            {item.repeatOffender > 0 && (
                              <div className="repeat-badge">🔁 Repeat offender — blocked {item.repeatOffender}x before</div>
                            )}
                            <div className="tc-block-info">
                              Detected at block #{item.blockNumber}
                              {item.window && item.window !== 30 && <span className="window-tag">{item.window}s window</span>}
                            </div>
                          </div>
                          <div className="tc-divider" />
                          <div className="tc-col">
                            <div className="tc-col-label">🎯 Target contract</div>
                            <div className="tc-target-name" style={{ color: pcfg.color }}>{pcfg.icon} {pcfg.label}</div>
                            <div className="tc-target-type">{item.protocol?.toUpperCase()} PROTOCOL</div>
                            {target?.address && (
                              <div className="tc-target-addr" title={target.address}>{target.address}</div>
                            )}
                          </div>
                        </div>
                        <div className="tc-footer">
                          <Countdown until={item.until} nowTs={nowTs} />
                          <button className="btn-unblock" disabled={loading === item.wallet} onClick={() => doAction(item.wallet)}>
                            {loading === item.wallet ? "Working…" : "Unblock"}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            {/* BLOCK HISTORY */}
            {(filterItems(expiredBlocks).length > 0 || expiredBlocks.length > 0) && (
              <section className="section section-history">
                <div className="section-head">
                  <h2>Block History {expiredBlocks.length > 0 && <span className="history-count">{expiredBlocks.length} expired</span>}</h2>
                  <button className="btn-toggle-history" onClick={() => setShowHistory(v => !v)}>
                    {showHistory ? "▲ Hide" : "▼ Show"}
                  </button>
                </div>
                {showHistory && (
                  filterItems(expiredBlocks).length === 0
                    ? <div className="empty-state"><div className="empty-text">No expired blocks match your filter.</div></div>
                    : (
                      <div className="threat-list">
                        {filterItems(expiredBlocks).map((item, idx) => {
                          const attack    = parseAttack(item.reason, item.protocol);
                          const pcfg      = cfg(item.protocol);
                          const target    = protoMap[item.protocol?.toLowerCase()];
                          const expiredAt = item.until ? new Date(Number(item.until) * 1000).toLocaleTimeString() : "—";
                          return (
                            <div className="threat-card threat-card-expired" key={idx}>
                              <div className="tc-header">
                                <div className="tc-addr-block">
                                  <span className="tc-tag tc-tag-expired">EXPIRED</span>
                                  <WalletLink address={item.wallet} onOpen={openWallet} copied={copied} onCopy={copyAddr} />
                                </div>
                                <RiskGauge value={item.riskScore} />
                              </div>
                              <AttackStrip item={item} />
                              <div className="tc-body">
                                <div className="tc-col">
                                  <div className="tc-col-label">⚡ What they did</div>
                                  <div className="tc-action">{attack.action}</div>
                                  <div className="tc-pattern">{attack.pattern}</div>
                                  <div className="tc-block-info">Detected at block #{item.blockNumber}</div>
                                </div>
                                <div className="tc-divider" />
                                <div className="tc-col">
                                  <div className="tc-col-label">🎯 Target contract</div>
                                  <div className="tc-target-name" style={{ color: pcfg.color }}>{pcfg.icon} {pcfg.label}</div>
                                  {target?.address && <div className="tc-target-addr">{target.address}</div>}
                                </div>
                              </div>
                              <div className="tc-footer tc-footer-expired">
                                <span className="expired-badge">🔓 Block expired at {expiredAt}</span>
                                <span className="expired-duration">Duration: 600s auto-release</span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )
                )}
              </section>
            )}

            {/* FROZEN */}
            {filterItems(frozen).length > 0 && (
              <section className="section section-ice">
                <div className="section-head">
                  <h2>🧊 Frozen Wallets</h2>
                  <span className="section-note danger-note">Permanent — requires manual release</span>
                </div>
                <div className="threat-list">
                  {filterItems(frozen).map((item, idx) => {
                    const attack = parseAttack(item.reason, item.protocol);
                    const pcfg   = cfg(item.protocol);
                    const target = protoMap[item.protocol?.toLowerCase()];
                    return (
                      <div className="threat-card threat-card-ice" key={idx}>
                        <div className="tc-header">
                          <div className="tc-addr-block">
                            <span className="tc-tag tc-tag-ice">FROZEN</span>
                            <WalletLink address={item.wallet} onOpen={openWallet} copied={copied} onCopy={copyAddr} />
                          </div>
                          <RiskGauge value={item.riskScore} />
                        </div>
                        <AttackStrip item={item} />
                        <div className="tc-body">
                          <div className="tc-col">
                            <div className="tc-col-label">⚡ What they did</div>
                            <div className="tc-action">{attack.action}</div>
                            <div className="tc-pattern">{attack.pattern}</div>
                          </div>
                          <div className="tc-divider" />
                          <div className="tc-col">
                            <div className="tc-col-label">🎯 Target contract</div>
                            <div className="tc-target-name" style={{ color: pcfg.color }}>{pcfg.icon} {pcfg.label}</div>
                            {target?.address && <div className="tc-target-addr">{target.address}</div>}
                          </div>
                        </div>
                        <div className="tc-footer">
                          <span className="frozen-badge">🧊 PERMANENTLY FROZEN</span>
                          <button className="btn-unfreeze" disabled={loading === item.wallet} onClick={() => doAction(item.wallet, "unfreeze")}>
                            {loading === item.wallet ? "Working…" : "Unfreeze"}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            {/* INCIDENT LOG */}
            <section className="section">
              <div className="section-head">
                <h2>Incident Log</h2>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <span className="section-note">{filterIncidents(incidents).length} events</span>
                  <button className="btn-export" onClick={() => exportCSV("all", filterIncidents(incidents))}>⬇ CSV</button>
                  <button className="btn-export btn-export-pdf" onClick={exportPDF}>🖨 PDF</button>
                </div>
              </div>
              {filterIncidents(incidents).length === 0 ? (
                <div className="empty-state"><div className="empty-text">No incidents match filters.</div></div>
              ) : (
                <div className="log-table-wrap">
                  <table className="log-table">
                    <thead>
                      <tr>
                        <th>Block</th>
                        <th>Wallet</th>
                        <th>Risk</th>
                        <th>Protocol</th>
                        <th>Attack Type</th>
                        <th>Description</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filterIncidents(incidents).map((item, idx) => {
                        const attack  = parseAttack(item.anomalyType, item.protocol);
                        const pcfg    = cfg(item.protocol);
                        const isUnk   = item.attackType === "unknown_anomaly";
                        const info    = item.attackType ? ATTACK_INFO[item.attackType] : null;
                        const cat     = info?.cat;
                        const cs      = cat && CAT_COLORS[cat];
                        const hasAtk  = item.attackType && item.attackType !== "normal";
                        const atkName = isUnk ? "👻 Unknown Type of Attack" : (info?.name ?? item.attackType?.replace(/_/g, " "));
                        const atkDesc = isUnk ? describeUnknown(item.reason) : (info?.desc ?? attack.action);
                        return (
                          <tr key={idx} className={item.action === "FREEZE" ? "row-ice" : ""}>
                            <td className="td-block">#{item.blockNumber}</td>
                            <td><WalletLink address={item.wallet} short onOpen={openWallet} copied={copied} onCopy={copyAddr} /></td>
                            <td>
                              <span className={`risk-pill ${item.riskScore >= 90 ? "rp-crit" : item.riskScore >= 70 ? "rp-high" : "rp-med"}`}>
                                {item.riskScore}
                              </span>
                            </td>
                            <td><span className="proto-pill" style={{ color: pcfg.color }}>{pcfg.icon} {pcfg.label}</span></td>
                            <td>
                              {hasAtk ? (
                                <div className="log-atk-cell">
                                  {cat && cs && <span className="log-atk-cat" style={{ background: cs.bg, color: cs.fg, borderColor: cs.border }}>{cat}</span>}
                                  <span className="log-atk-name" style={{ color: cs?.fg ?? "#94a3b8" }}>{atkName}</span>
                                  {!isUnk && item.confidence != null && <span className="log-atk-conf">{(item.confidence * 100).toFixed(0)}%</span>}
                                </div>
                              ) : (
                                <span style={{ color: "#334155", fontSize: 11 }}>—</span>
                              )}
                            </td>
                            <td className="td-log-desc">{hasAtk ? atkDesc : attack.action}</td>
                            <td>
                              <span className={`action-tag ${
                                item.action === "FREEZE" ? "at-freeze"
                                : item.action === "BLOCK_TEMP" ? "at-block"
                                : item.action === "BLOCK_PROTOCOL" ? "at-proto"
                                : item.action === "WARN" ? "at-warn"
                                : "at-log"
                              }`}>{item.action}</span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </>
        )}

        {/* ══════════════ STATS TAB ══════════════ */}
        {activeTab === "stats" && (
          <StatsTab stats={stats} />
        )}

        {/* ══════════════ CONFIG TAB ══════════════ */}
        {activeTab === "config" && (
          <ConfigTab
            circuitBreakerPaused={cbPaused}
            onToggleCB={toggleCB}
            cbLoading={cbLoading}
            whitelist={whitelist}
            onAddWL={addToWhitelist}
            onRemoveWL={removeFromWhitelist}
            wlLoading={wlLoading}
            health={health}
            showFlash={showFlash}
          />
        )}

        {/* ══════════════ DEMO ATTACK TAB ══════════════ */}
        {activeTab === "demo" && (
          <DemoTab api={API} />
        )}

      </div>

      {/* ── Modal wallet ── */}
      {walletModal && (
        <WalletModal
          address={walletModal.address}
          data={walletModal.data}
          loading={modalLoading}
          onClose={() => setWalletModal(null)}
          copied={copied}
          onCopy={copyAddr}
        />
      )}

    </div>
  );
}
