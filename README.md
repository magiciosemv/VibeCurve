# 🌊 VibeCurve: Solana High-Frequency Sniper (MVP)

![Solana](https://img.shields.io/badge/Solana-Mainnet-green) ![Status](https://img.shields.io/badge/Status-Operational-blue) ![Jito](https://img.shields.io/badge/MEV-Jito_Bundles-purple)

> **"Ride the Curve, Capture the Alpha."**
> 
> *Built for Trends x Solana Vibe Coding Hackathon.*

## 📖 Project Overview

**VibeCurve** is a high-performance trading bot designed to snipe token launches on Pump.fun and Trends.fun. Unlike traditional bots that spam public RPCs, VibeCurve utilizes a hybrid **Polling-Sniper Architecture** to bypass rate limits and leverages **Jito Bundles** for atomic, sandwich-resistant execution.

## 🚀 Key Features (Implemented)

### 1. 🛡️ Infrastructure & Connectivity
- **Hybrid RPC/WSS Handling**: Custom logic to handle rate-limited free RPC nodes (Helius/QuickNode).
- **Auto-Recovery**: Automatic reconnection and error handling for WebSocket streams.
- **Environment Security**: `.env` based configuration for sensitive keys.

### 2. 🦅 Sniper Mode (The Listener)
- **Single-Fire Polling**: Bypasses `Batch Request` limits on free tier RPCs.
- **Latency Optimization**: Tuned polling intervals (1000-3000ms) to balance freshness vs. rate limits.
- **Target Locking**: Specifically monitors high-velocity tokens ("King of the Hill").

### 3. 🧠 On-Chain Decoder (The Brain)
- **Transaction Parsing**: Decodes `getParsedTransaction` data to understand flow.
- **Balance Analysis**: algorithmically determines **BUY** vs **SELL** direction based on `preTokenBalances` vs `postTokenBalances`.
- **Noise Filtering**: Ignores dust transactions to focus on Smart Money movements.

### 4. ⚡ MEV Integration (The Muscle)
- **Jito Block Engine**: Fully integrated `jito-ts` searcher client.
- **gRPC Connectivity**: Custom formatted connection logic to communicate with Amsterdam/NY Jito validators.
- **Bundle Readiness**: Architecture supports atomic bundle submission (Buy + Tip).

## 🛠 Tech Stack

- **Runtime**: Node.js (v20 LTS recommended)
- **Language**: TypeScript
- **Solana SDK**: `@solana/web3.js`
- **MEV SDK**: `jito-ts` (gRPC)

## 📂 Project Structure

```text
VibeCurve/
├── src/
│   ├── core/
│   │   └── jito.ts        # Jito Block Engine connection manager
│   ├── listeners/
│   │   └── sniper.ts      # Targeted token monitoring & decoding
│   ├── config.ts          # Centralized configuration
│   └── index.ts           # Bot Entrypoint
├── scripts/               # Python analysis scripts (Beta)
├── .env                   # Secrets (Not committed)
└── package.json