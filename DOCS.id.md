# Charon-Base — Dokumentasi Lengkap (Bahasa Indonesia)

Charon-Base adalah agen trading otomatis yang dikendalikan dari Telegram untuk
menyaring memecoin di **Base chain**. Bot menggabungkan polling sumber sinyal,
filter strategi, screening LLM, dan eksekusi swap melalui 0x atau Uniswap. Tiga
mode eksekusi tersedia: `dry_run` (simulasi), `confirm` (konfirmasi manual via
Telegram), dan `live` (eksekusi otomatis).

> ⚠️ **Peringatan**: Bot ini sedang dalam masa pengujian. Tidak ada jaminan
> hasil keuangan. Anda bertanggung jawab penuh atas dana yang dipakai.

---

## Daftar Isi

1. [Arsitektur](#arsitektur)
2. [Alur Kerja](#alur-kerja)
3. [Persyaratan Sistem](#persyaratan-sistem)
4. [Instalasi](#instalasi)
5. [Konfigurasi `.env`](#konfigurasi-env)
6. [Sumber Sinyal](#sumber-sinyal)
7. [Enrichment (Pengganti GMGN)](#enrichment-pengganti-gmgn)
8. [Strategi Bawaan](#strategi-bawaan)
9. [Daftar Lengkap Parameter Strategi](#daftar-lengkap-parameter-strategi)
10. [Mode Eksekusi](#mode-eksekusi)
11. [LLM (Screening)](#llm-screening)
12. [Perintah Telegram](#perintah-telegram)
13. [Inline Menu](#inline-menu)
14. [Storage (SQLite)](#storage-sqlite)
15. [Position Monitor (TP/SL)](#position-monitor-tpsl)
16. [Troubleshooting](#troubleshooting)
17. [Operasional Harian](#operasional-harian)
18. [FAQ](#faq)

---

## Arsitektur

```
charon-base/
├── index.js                    # Entry point — load dotenv lalu start app
├── package.json
├── com.charon-base.plist       # macOS launchd auto-start agent
├── README.md                   # Versi singkat (English)
├── DOCS.id.md                  # Dokumen ini
├── .env / .env.example         # Konfigurasi rahasia
└── src/
    ├── app.js                  # Glue: poller + monitor + handler
    ├── config.js               # Parser .env → object config
    ├── format.js               # Helper format pesan Telegram
    ├── utils.js                # Logger, pct, fmtUsd, sleep, dll
    ├── liveExecutor.js         # Mode dry_run / confirm / live
    ├── db/
    │   └── index.js            # better-sqlite3, schema, prepared stmts
    ├── signals/
    │   ├── poller.js           # Loop polling tiap SIGNAL_POLL_MS
    │   ├── sources.js          # Adaptor DexScreener/GeckoTerminal/CoinGecko/LunarCrush/custom
    │   └── coingecko.js        # CoinGecko trending (free, no key)
    ├── enrichment/
    │   ├── tokenInfo.js        # Aggregator semua enricher
    │   ├── dexscreener.js      # Harga + likuiditas + volume
    │   ├── goplus.js           # Honeypot + tax + holders + open-source
    │   ├── moralis.js          # Holder analytics tambahan (opsional)
    │   └── lunarcrush.js       # Social metrics via MCP (opsional, berbayar)
    ├── execution/
    │   ├── router.js           # Switch zeroex/uniswap
    │   ├── zeroex.js           # 0x Swap API v2 (default)
    │   └── uniswap.js          # Stub Uniswap V3
    ├── pipeline/
    │   ├── candidates.js       # Pipeline orchestrator
    │   ├── filters.js          # Gate strategy filter
    │   ├── strategies.js       # Strategi bawaan + getter/setter SQLite
    │   ├── llm.js              # Panggil LLM OpenAI-compatible
    │   └── positionMonitor.js  # Cek TP/SL/trailing tiap POSITION_CHECK_MS
    ├── telegram/
    │   ├── bot.js              # node-telegram-bot-api + setMyCommands
    │   ├── commands.js         # Handler /menu /strategy /pnl /model /trending dll
    │   └── menu.js             # Inline keyboard
    └── learning/
        └── lessons.js          # /learn dan /lessons (PnL summary)
```

### Komponen utama

| Modul | Fungsi |
|---|---|
| `signals/poller.js` | Polling sumber sinyal, simpan kandidat ke SQLite |
| `enrichment/*` | Tambah harga, security flag, holder count |
| `pipeline/filters.js` | Cek apakah kandidat lolos parameter strategi |
| `pipeline/llm.js` | Kirim batch kandidat ke LLM, ambil pick `BUY` |
| `liveExecutor.js` | Buka posisi (dry_run/confirm/live) |
| `pipeline/positionMonitor.js` | Tutup posisi saat hit TP/SL/max-hold |
| `telegram/bot.js` | Interface user, alert, intent confirm |

---

## Alur Kerja

```
┌─────────────────┐
│ Sumber Sinyal   │  DexScreener trending Base
│  (tiap 30s)     │  + opsional GeckoTerminal/custom server
└────────┬────────┘
         ↓
┌─────────────────┐
│ Enrichment      │  DexScreener (harga/liq/vol)
│                 │  GoPlus (honeypot/tax/holders)
│                 │  Moralis (opsional)
└────────┬────────┘
         ↓
┌─────────────────┐
│ Filter Strategi │  min_liquidity, min_holders, max_buy_tax,
│                 │  block_honeypot, max_age_minutes, dll
└────────┬────────┘
         ↓ (lolos)
┌─────────────────┐
│ LLM Screener    │  Kimi-K2.6 / GPT-4o-mini / dll
│ (opsional)      │  Pilih 1 BUY dari batch, beri confidence
└────────┬────────┘
         ↓ (decision = BUY, conf ≥ ambang)
┌─────────────────┐
│ Executor        │  dry_run → simulasi
│                 │  confirm  → Telegram approve/reject
│                 │  live     → 0x swap signed → on-chain
└────────┬────────┘
         ↓
┌─────────────────┐
│ Position        │  Cek harga tiap 10s
│ Monitor         │  Tutup saat TP/SL/trailing/max_hold
└─────────────────┘
```

---

## Persyaratan Sistem

| Kebutuhan | Versi/Detail |
|---|---|
| Node.js | ≥ 20 (sudah test di v25) |
| npm | ≥ 10 |
| Python 3 | dipakai `better-sqlite3` saat compile |
| Xcode CLT (macOS) | clang/make untuk native module |
| Internet stabil | bot polling Telegram + RPC |
| Disk | < 100 MB termasuk `node_modules` |
| RAM | < 200 MB saat idle |

Untuk mode `live`:

- Wallet EVM dengan private key (rekomendasi: wallet baru khusus bot)
- Saldo ETH di Base ≥ `LIVE_MIN_ETH_RESERVE + DEFAULT_BUY_ETH × max_concurrent_positions`
- API key 0x (gratis di https://dashboard.0x.org)
- RPC Base berbayar (Alchemy/QuickNode) direkomendasikan untuk throughput

---

## Instalasi

### 1. Clone repo

```bash
git clone https://github.com/aretaafandi16-ui/charon-base.git
cd charon-base
```

### 2. Install dependencies

```bash
npm install
```

`better-sqlite3` akan di-compile native — butuh Python 3 + Xcode CLT (macOS) atau
`build-essential` (Linux). Compile biasanya 30-60 detik.

### 3. Salin file konfigurasi

```bash
cp .env.example .env
```

### 4. Edit `.env`

Isi minimal `TELEGRAM_BOT_TOKEN` dan `TELEGRAM_CHAT_ID` untuk mode `dry_run`.
Lihat bagian [Konfigurasi .env](#konfigurasi-env) untuk detail.

### 5. Cek konfigurasi

```bash
npm run check
```

Harusnya keluar `config ok`.

### 6. Jalankan

```bash
npm start
```

Untuk production, gunakan PM2 supaya bot auto-restart kalau crash:

```bash
npm install -g pm2
pm2 start index.js --name charon-base
pm2 save
pm2 startup     # ikuti instruksi yang muncul
```

Untuk macOS, gunakan launchd (sudah disertakan file plist):

```bash
cp com.charon-base.plist ~/Library/LaunchAgents/
launchctl load ~/Library/LaunchAgents/com.charon-base.plist
```

Fitur launchd:
- Auto-start saat boot/login
- Auto-restart saat crash atau network mati
- Log ke `logs/stdout.log` dan `logs/stderr.log`
- Jeda 5 detik antar restart

Kelola:

```bash
launchctl list | grep charon                     # cek status
launchctl kickstart -k gui/$(id -u)/com.charon-base  # force restart
launchctl unload ~/Library/LaunchAgents/com.charon-base.plist  # stop
tail -f logs/stdout.log                          # lihat log
```

### 7. Coba dari Telegram

Buka chat dengan bot, kirim `/menu`. Kalau menu muncul, instalasi sukses.

---

## Konfigurasi `.env`

### Wajib (dry_run sudah cukup)

```
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=
```

- `TELEGRAM_BOT_TOKEN` — dari @BotFather di Telegram (`/newbot` lalu dapatkan
  token)
- `TELEGRAM_CHAT_ID` — ID chat/group tempat bot kirim alert. Cara cepat: chat
  `@userinfobot` di Telegram, dia balas user ID Anda.

### Sumber sinyal

```
SIGNAL_SOURCES=dexscreener,coingecko
SIGNAL_POLL_MS=30000
SIGNAL_SERVER_URL=
SIGNAL_SERVER_KEY=
DEXSCREENER_BASE_URL=https://api.dexscreener.com
GECKOTERMINAL_BASE_URL=https://api.geckoterminal.com/api/v2
```

- `SIGNAL_SOURCES` — comma-separated. Pilihan: `dexscreener`, `coingecko`,
  `geckoterminal`, `lunarcrush`, `custom`. Default `dexscreener`.
  Rekomendasi: `dexscreener,coingecko` (keduanya gratis).
- `SIGNAL_POLL_MS` — interval polling. Jangan kurang dari 15000 (15 detik) untuk
  hindari kena rate-limit.

### Enrichment

```
MORALIS_API_KEY=
LUNARCRUSH_API_KEY=
```

GoPlus dipakai otomatis tanpa API key. Moralis opsional — daftar gratis di
https://moralis.com untuk dapat holder analytics tambahan. LunarCrush opsional —
membutuhkan subscription berbayar di https://lunarcrush.com/pricing.

### RPC Base

```
BASE_RPC_URL=https://mainnet.base.org
BASE_WS_URL=
ALCHEMY_API_KEY=
```

Public RPC `mainnet.base.org` cukup untuk `dry_run`. Untuk `live`, pakai
Alchemy/QuickNode/BlockPI agar tidak kena throttle.

### Wallet (live/confirm)

```
EVM_PRIVATE_KEY=
LIVE_MIN_ETH_RESERVE=0.005
```

- `EVM_PRIVATE_KEY` — hex 64-char tanpa `0x` prefix. **GUNAKAN WALLET BARU** —
  jangan pakai wallet utama Anda.
- `LIVE_MIN_ETH_RESERVE` — minimal saldo ETH yang harus tersisa setelah buy.
  Default 0.005 ETH (~$15) untuk gas.

### Eksekusi

```
TRADING_MODE=dry_run
ROUTER=zeroex
ZEROEX_BASE_URL=https://base.api.0x.org
ZEROEX_API_KEY=
UNISWAP_ROUTER_ADDRESS=0x2626664c2603336E57B271c5C0b26F421741e481
DEFAULT_SLIPPAGE_BPS=200
DEFAULT_BUY_ETH=0.01
POSITION_CHECK_MS=10000
```

- `TRADING_MODE` — `dry_run` | `confirm` | `live`
- `ROUTER` — `zeroex` (default, recommended) atau `uniswap` (stub, perlu
  implementasi sendiri)
- `DEFAULT_SLIPPAGE_BPS=200` artinya 2%. Naikkan kalau swap kecil sering revert.
- `DEFAULT_BUY_ETH` — ukuran buy default per posisi. Strategi bisa override.
- `POSITION_CHECK_MS` — interval polling harga untuk TP/SL.

### LLM

```
ENABLE_LLM=true
LLM_BASE_URL=https://api.openai.com/v1
LLM_API_KEY=
LLM_MODEL=gpt-4o-mini
LLM_TIMEOUT_MS=120000
LLM_CANDIDATE_PICK_COUNT=5
LLM_CANDIDATE_MAX_AGE_MS=600000
```

Endpoint terverifikasi:

| Provider | Base URL | Contoh model |
|---|---|---|
| OpenAI | `https://api.openai.com/v1` | `gpt-4o-mini` |
| NVIDIA NIM | `https://integrate.api.nvidia.com/v1` | `moonshotai/kimi-k2.6` |
| MiniMax | `https://api.minimax.io/v1` | `MiniMax-M2.7` |
| Groq | `https://api.groq.com/openai/v1` | `llama-3.3-70b-versatile` |
| Ollama lokal | `http://localhost:11434/v1` | `llama3.2` |

- `LLM_TIMEOUT_MS` — naikkan ke 120000+ kalau pakai model besar (Kimi K2.6,
  GPT-4o, dll).
- `LLM_CANDIDATE_PICK_COUNT` — jumlah kandidat yang dikirim per batch. Lebih
  kecil = lebih cepat & lebih murah, tapi pilihan lebih sempit.

### Storage

```
DB_PATH=./charon-base.sqlite
```

---

## Sumber Sinyal

| Source | Key | Catatan |
|---|---|---|
| `dexscreener` | tidak perlu | Trending profile + lookup pair Base. Stabil, default. |
| `coingecko` | tidak perlu | Top 15 trending coins global, filter Base. Free, no key. |
| `geckoterminal` | tidak perlu | Trending pools `base`. Rate limit ketat (~30 req/min). |
| `lunarcrush` | `LUNARCRUSH_API_KEY` + subscription | Social trending Base ecosystem via MCP. |
| `custom` | `SIGNAL_SERVER_URL` + `SIGNAL_SERVER_KEY` | Endpoint Charon-style Anda sendiri. |

Rekomendasi: `SIGNAL_SOURCES=dexscreener,coingecko` — keduanya gratis dan stabil.

Saat banyak source aktif, kandidat di-merge berdasarkan address. Setiap source
yang mendeteksi token sama akan menambah entri ke `sources[]`. Strategi bisa
mensyaratkan minimum sources via `min_sources`.

### Format custom server

```
GET {SIGNAL_SERVER_URL}/signals
Headers: x-api-key: {SIGNAL_SERVER_KEY}

Response:
[
  {
    "address": "0x...",
    "symbol": "...",
    "name": "...",
    "priceUsd": 0.0001,
    "liquidityUsd": 50000,
    "volume24h": 200000,
    "marketCap": 500000,
    "holders": 1000,
    "ageMinutes": 60,
    "url": "https://dexscreener.com/..."
  }
]
```

---

## Enrichment (Pengganti GMGN)

Charon-Base **tidak** pakai GMGN proprietary. Sebagai gantinya:

### GoPlus Token Security (otomatis, tanpa key)

- `holders` — total pemegang
- `lpHolders` — pemegang LP token
- `buyTax` / `sellTax` — pajak transaksi (%) — **dikonversi dari desimal ke persen**
- `isHoneypot` — true/false (ini gate kritikal)
- `isOpenSource` — kontrak verified atau tidak
- `isProxy` / `isMintable` / `transferPausable` — flag rugpull
- `ownerAddress` / `creatorAddress`

### DexScreener (otomatis, tanpa key)

- `priceUsd`, `liquidityUsd`, `volume24h`, `marketCap`, `fdv`
- `priceChange1h/6h/24h`
- `txns24h`
- `dexUrl`, `pairAddress`

### Moralis (opsional, perlu API key gratis)

- `holders` lebih akurat daripada GoPlus
- `top10HolderPct` — distribusi paus
- `totalBuyers24h` / `totalSellers24h`

### LunarCrush (opsional, perlu subscription)

- `galaxyScore` — Galaxy Score™ (0-100)
- `socialVolume24h` — jumlah post/mention 24h
- `interactions24h` — total engagement (likes, shares, comments)
- `socialDominance` — dominasi sosial vs crypto lain
- `sentiment` — sentiment score

Setiap enricher punya **rate-limit queue** dan **cache 60 detik–5 menit**, jadi
bot tidak akan banjir limit walau polling sering.

---

## Strategi Bawaan

5 strategi pre-config disimpan di SQLite saat pertama kali jalan. Hot-reload
saat diubah via `/stratset`.

| ID | Tujuan | LLM | Buy Size | TP/SL |
|---|---|---|---|---|
| `sniper` | Token muda <4 jam, momentum kuat | ✅ 70 | 0.01 ETH | +75% / -35% |
| `dip_buy` | Token matang lagi dump 24h | ✅ 65 | 0.015 ETH | +60% / -25% |
| `smart_money` | Liquidity besar, holder banyak | ✅ 75 | 0.02 ETH | +100% / -30% |
| `degen` | Token paling muda, threshold rendah | ❌ | 0.005 ETH | +150% / -50% |
| `microcap` | Sweet spot $250k–$1.2M MC | ✅ 60 | 0.01 ETH | +100% / -30% |

### Cara mengatur strategi aktif

```
/strategy microcap
```

atau via menu inline `/menu → Strategy → microcap`.

Hanya 1 strategi aktif pada satu waktu. Strategi non-aktif tetap disimpan dan
bisa di-tweak.

---

## Daftar Lengkap Parameter Strategi

| Parameter | Tipe | Arti |
|---|---|---|
| `name` | string | ID strategi (jangan diubah) |
| `use_llm` | bool | Panggil LLM screener atau tidak |
| `llm_min_confidence` | int 0–100 | Confidence minimum untuk eksekusi |
| `min_sources` | int | Minimum jumlah source yang harus deteksi token |
| `min_liquidity_usd` | usd | Likuiditas pool minimum |
| `min_volume_24h_usd` | usd | Volume 24h minimum |
| `max_age_minutes` | menit | Token tidak boleh lebih tua dari ini |
| `min_marketcap_usd` | usd | MC floor |
| `max_marketcap_usd` | usd | MC ceiling |
| `min_holders` | int | Holder minimum |
| `min_price_change_1h` | desimal | Misal `0.05` = +5% (momentum minimum 1h) |
| `max_price_change_24h` | desimal | Misal `3.0` = +300% (skip parabolik) |
| `max_concurrent_positions` | int | Maksimum posisi terbuka simultan |
| `buy_eth` | float | Ukuran buy per posisi (ETH) |
| `tp_percent` | int | Take-profit (% dari entry) |
| `sl_percent` | int | Stop-loss (%) |
| `trailing_tp_percent` | int | Trailing TP setelah hit TP awal |
| `max_hold_ms` | ms | Auto-close kalau belum kena TP/SL |
| `partial_tp` | 0/1 | Aktifkan partial TP |
| `block_honeypot` | bool | Tolak token yang GoPlus flag honeypot |
| `max_buy_tax_pct` | int | Pajak buy maksimum (%) |
| `max_sell_tax_pct` | int | Pajak sell maksimum (%) |
| `require_open_source` | bool | Kontrak harus verified |
| `block_pausable` | bool | Tolak kontrak yang transfernya bisa dipause |

### Cara mengubah parameter

```
/stratset <strategy_id> <key> <value>
```

Contoh:

```
/stratset microcap min_holders 200
/stratset microcap llm_min_confidence 70
/stratset sniper buy_eth 0.005
/stratset degen block_honeypot true
```

Tipe value otomatis di-cast (number/boolean/string) berdasarkan tipe default.

---

## Mode Eksekusi

### `dry_run` (default — aman untuk test)

- Tidak butuh wallet/private key
- Setiap "buy" hanya disimpan ke SQLite sebagai posisi virtual
- Position monitor tetap jalan dan menutup posisi sesuai TP/SL berdasarkan
  harga real-time
- PnL dapat dilihat dengan `/pnl`

Cocok untuk: tuning strategi, test LLM, test alert flow.

### `confirm` (manual approve)

- Butuh `EVM_PRIVATE_KEY`, `ZEROEX_API_KEY`
- Saat strategi+LLM approve, bot **tidak langsung** eksekusi
- Bot kirim pesan Telegram dengan tombol **✅ Approve** / **❌ Reject**
- Hanya setelah Anda tap Approve, swap di-submit
- Posisi yang terbuka tetap dimonitor untuk TP/SL otomatis

Cocok untuk: live tapi masih manual review tiap entry.

### `live` (full auto)

- Butuh `EVM_PRIVATE_KEY`, `ZEROEX_API_KEY`, RPC sehat
- Setiap pick langsung di-swap via 0x Ultra mode
- Slippage default 2% (bisa diubah via `DEFAULT_SLIPPAGE_BPS`)
- Position monitor jalan untuk close otomatis

Sebelum live, bot cek: `balance - buy_eth ≥ LIVE_MIN_ETH_RESERVE`. Kalau tidak
cukup, transaksi dibatalkan dengan alert.

> **Catatan**: Auto-sell di mode `live` saat hit TP/SL **belum diimplementasi**
> di scaffold ini. Position monitor menutup posisi di SQLite (status
> `closed_tp/sl/max_hold`) tetapi tidak otomatis swap kembali ke ETH. Anda
> perlu close manual dari wallet, atau extend `liveExecutor.js` dengan
> fungsi `executeLiveSell`.

---

## LLM (Screening)

### Format request

Bot kirim payload `chat/completions` standar OpenAI:

```json
{
  "model": "moonshotai/kimi-k2.6",
  "temperature": 0.2,
  "response_format": { "type": "json_object" },
  "messages": [
    { "role": "system", "content": "You are a screener..." },
    { "role": "user", "content": "{\"candidates\":[...]}" }
  ]
}
```

### Format response yang diharapkan

```json
{
  "decision": "BUY" | "NONE",
  "index": 0,
  "confidence": 75,
  "reason": "strong holder growth + low tax"
}
```

### Strategi tanpa LLM

Set `use_llm: false` di strategi (default `degen`). Bot akan auto-approve
kandidat pertama yang lolos filter — tanpa panggilan LLM.

### Multi-provider

Ganti `LLM_BASE_URL` + `LLM_MODEL` saja. Tidak perlu ubah code.

---

## Perintah Telegram

Semua perintah ter-register via `setMyCommands` jadi muncul di tombol `/` di
samping tombol attach file.

| Perintah | Fungsi | Contoh |
|---|---|---|
| `/menu` | Tampilkan main menu (inline keyboard) | `/menu` |
| `/strategy` | List strategi atau ganti aktif | `/strategy microcap` |
| `/stratset` | Atur parameter strategi | `/stratset microcap tp_percent 80` |
| `/positions` | List posisi terbuka | `/positions` |
| `/candidate` | Inspect token by address | `/candidate 0xabc...` |
| `/filters` | Tampilkan parameter strategi aktif | `/filters` |
| `/pnl` | Ringkasan PnL 7 hari | `/pnl` |
| `/model` | Lihat atau ganti LLM model | `/model gpt-4o` |
| `/trending` | Trending tokens/topics (CoinGecko/LunarCrush) | `/trending topics` |
| `/learn` | Catat lesson untuk window | `/learn 24h` |
| `/lessons` | List 5 lesson terakhir | `/lessons` |
| `/walletadd` | Simpan wallet untuk track | `/walletadd whale1 0x...` |
| `/walletremove` | Hapus wallet tersimpan | `/walletremove whale1` |
| `/wallets` | List wallet tersimpan | `/wallets` |

### Detail beberapa perintah

#### `/model [name]`

Tanpa argumen: tampilkan model LLM yang aktif sekarang. Dengan argumen: ganti
model. Disimpan di SQLite — survive restart.

```
/model                          → Current LLM model: moonshotai/kimi-k2.6
/model gpt-4o-mini              → LLM model → gpt-4o-mini
```

Bisa juga dipilih dari menu inline: `/menu → 🤖 Model`.

#### `/trending [coins|topics]`

Tampilkan trending tokens/topics dari CoinGecko atau LunarCrush.

```
/trending               → Trending coins di Base (CoinGecko/LunarCrush)
/trending topics        → Trending topics di crypto social media
```

Bisa diakses dari menu inline: `/menu → 🔥 Trending`.

#### `/learn <window>`

Window: `1h`, `24h`, atau `7d`. Hitung total trade, win rate, dan avg PnL
dalam window tersebut, lalu simpan sebagai lesson di SQLite.

#### `/candidate <address>`

Lookup kandidat dari cache. Tampilkan:
- Symbol + address pendek
- Market cap, liquidity, volume 24h
- Holders, age
- Price change 1h/6h/24h
- Buy/sell tax + honeypot flag
- Sumber yang mendeteksi
- URL DexScreener

#### `/walletadd <label> <address>`

Simpan address wallet untuk track. Belum ada strategi yang otomatis copy-trade
dari saved wallets — fitur ini tersedia sebagai dasar untuk extension.

---

## Inline Menu

`/menu` membuka keyboard 6 tombol:

- 📡 **Strategy** — pilih strategi aktif
- 📈 **Positions** — list posisi terbuka
- 🔥 **Trending** — trending tokens/topics (CoinGecko/LunarCrush)
- 🤖 **Model** — lihat/ganti LLM model
- 🧠 **Lessons** — riwayat learning runs
- ⚙ **Filters** — parameter strategi aktif

Saat mode `confirm`, setiap intent muncul dengan keyboard:

- ✅ **Approve** — eksekusi live
- ❌ **Reject** — batalkan

---

## Storage (SQLite)

File default: `./charon-base.sqlite`

### Tabel

- `candidates` — semua token yang pernah masuk pipeline
- `filter_results` — alasan setiap kandidat lolos/gagal filter
- `llm_decisions` — keputusan LLM per batch
- `positions` — posisi terbuka & tertutup (entry, TP/SL, PnL)
- `trades` — buy/sell legs
- `trade_intents` — intent menunggu approve di mode `confirm`
- `strategy_configs` — parameter strategi (di-update via `/stratset`)
- `saved_wallets` — wallet yang dipantau
- `settings` — key-value misc (active_strategy, dll)
- `lessons` — output `/learn`

### Akses langsung

```bash
sqlite3 charon-base.sqlite
.tables
SELECT * FROM positions WHERE status = 'open';
SELECT * FROM filter_results ORDER BY ts DESC LIMIT 20;
```

### Backup

File single .sqlite — tinggal copy. Disarankan backup harian kalau live mode.

---

## Position Monitor (TP/SL)

Loop jalan tiap `POSITION_CHECK_MS` (default 10 detik). Untuk setiap posisi
`open`:

1. Refresh harga dari DexScreener
2. Hitung PnL = `(now - entry) / entry`
3. Cek aturan close:
   - **TP**: `pnl × 100 ≥ tp_percent`
   - **SL**: `pnl × 100 ≤ -sl_percent`
   - **Max hold**: `now - opened_at ≥ max_hold_ms`
4. Kalau salah satu trigger, status posisi diset `closed_<reason>` dan kirim
   alert Telegram.

Setelah 3 kegagalan polling beruntun, bot kirim alert "position monitor: ..."
ke Telegram.

---

## Troubleshooting

### Telegram polling 401 Unauthorized berulang

Penyebab tersering: shell environment punya `TELEGRAM_BOT_TOKEN` lama (export
di `~/.zshrc`) yang menimpa `.env`. Perbaikan: bot sudah pakai
`dotenv.config({ override: true })`. Kalau masih 401, periksa:

```bash
echo $TELEGRAM_BOT_TOKEN
unset TELEGRAM_BOT_TOKEN
```

Atau hapus baris `export TELEGRAM_BOT_TOKEN` dari shell config.

### LLM 404 Page not found

Model name salah. Cek list model di endpoint:

```bash
curl https://integrate.api.nvidia.com/v1/models -H "Authorization: Bearer $LLM_API_KEY"
```

Pakai `id` yang tepat. Untuk NVIDIA, model Kimi yang ada saat ini:
`moonshotai/kimi-k2.6`.

### LLM timeout

Naikkan `LLM_TIMEOUT_MS` ke 120000+ dan turunkan `LLM_CANDIDATE_PICK_COUNT` ke
3-5. Model besar (Kimi K2.6, GPT-4o) sering butuh 30-90 detik untuk batch 10
kandidat.

### GeckoTerminal 429 Too Many Requests

Naikkan `SIGNAL_POLL_MS` jadi 60000, atau hapus `geckoterminal` dari
`SIGNAL_SOURCES`. Bot sudah pakai p-queue tapi GeckoTerminal sangat ketat.

### Bot tidak respond di Telegram

1. Cek `TELEGRAM_CHAT_ID` benar — bot **hanya** respond chat dengan ID yang
   match
2. Cek log — kalau ada `polling_error 401`, lihat poin di atas
3. Kalau group: pastikan bot di-add ke group dan privacy mode di BotFather
   sudah disable supaya bot bisa baca semua message

### `npm install` gagal compile better-sqlite3

macOS: `xcode-select --install`. Linux: `apt install build-essential python3`.

### "Insufficient ETH" saat live

Saldo wallet < `buy_eth + LIVE_MIN_ETH_RESERVE`. Top-up wallet, atau turunkan
`buy_eth` di strategi: `/stratset microcap buy_eth 0.005`.

---

## Operasional Harian

### Recommended workflow

1. **Mulai dengan dry_run** selama 24-72 jam. Pakai strategi `microcap` atau
   `sniper`. Pantau `/pnl` untuk lihat performa simulasi.
2. **Tweak strategi** via `/stratset` berdasarkan data.
3. **Naik ke confirm mode** untuk testing live tapi terkontrol. Setting wallet
   dengan saldo kecil ($50–100).
4. **Naik ke live mode** kalau `confirm` mode kasih hasil yang konsisten.

### Monitoring

- Bot kirim alert Telegram untuk setiap pick + posisi yang close
- `/positions` untuk snapshot real-time
- `/pnl` mingguan untuk evaluasi
- Backup `charon-base.sqlite` harian

### Update kode

```bash
git pull
npm install     # kalau ada dependency baru
pm2 restart charon-base
```

### Rotasi API key

Kalau API key bocor:
1. Revoke di provider (Telegram BotFather, NVIDIA, 0x)
2. Generate baru
3. Update `.env`
4. Restart bot

---

## FAQ

**Q: Apakah bot ini aman?**
A: Bot tidak menyimpan/transmisi `EVM_PRIVATE_KEY` ke server eksternal. Tapi
file `.env` tetap berisi private key plain-text — pastikan permission file
ketat (`chmod 600 .env`). Pakai wallet baru khusus bot, **jangan** wallet
utama.

**Q: Apakah saya akan untung?**
A: Tidak ada jaminan. Bot ini tool screening, bukan jaminan profit. Memecoin
trading risiko tinggi. Mulai kecil di dry_run, validasi performa, lalu
bertahap.

**Q: Berapa cost LLM per hari?**
A: Tergantung model + frekuensi. Default 1 batch = 1 panggilan / 30 detik.
Dengan `gpt-4o-mini`: ~$0.0001/call × 2880 calls/day = ~$0.30/hari.
Dengan Kimi K2.6 di NVIDIA NIM: gratis di tier free dengan kuota.

**Q: Bisa pakai chain selain Base?**
A: Tidak built-in. Tapi struktur kode modular — Anda bisa fork dan ganti:
- `chainId` di `signals/sources.js` (Base = 8453)
- `viem/chains.base` di `liveExecutor.js`
- Endpoint 0x sesuai chain (`base.api.0x.org` → `eth.api.0x.org`)
- Filter chain di GoPlus (`/api/v1/token_security/{chainId}`)

**Q: Position monitor hanya cek harga? Bagaimana kalau token rugged?**
A: Bot pakai DexScreener untuk harga. Kalau pool drained, harga di
DexScreener akan kelihatan crash → SL tertrigger. Tapi kalau pool dihapus
total, query gagal dan position monitor stuck. Solusi: extend
`positionMonitor.js` untuk juga query GoPlus tax tiap N siklus dan close
emergency kalau mendadak honeypot/tax 100%.

**Q: Bagaimana cara stop bot?**
A: `pm2 stop charon-base` atau Ctrl+C kalau via `npm start`. Posisi terbuka
tetap di SQLite — saat restart, monitor lanjut dari titik terakhir.

**Q: Bagaimana cara reset semua data?**
A: Hapus file `charon-base.sqlite*` lalu restart. Strategi default akan
re-seed otomatis.

**Q: Mau pakai LLM lokal (Ollama)?**
A: Set `LLM_BASE_URL=http://localhost:11434/v1`, `LLM_MODEL=llama3.2`,
`LLM_API_KEY=ollama`. Pastikan Ollama running dan model sudah di-pull.

---

## Lisensi & Kontribusi

Repo private milik `aretaafandi16-ui/charon-base`. Kalau ingin extend:
1. Fork lokal
2. Buat branch baru
3. PR ke main

Bug atau request fitur? Buka issue di GitHub.

---

> **Disclaimer**: Tool ini disediakan apa adanya tanpa jaminan apa pun. Pengguna
> bertanggung jawab penuh atas keputusan trading dan dana yang digunakan.
> Memecoin trading membawa risiko kehilangan total modal.
