# Bloub Desktop Mascot

Mascot desktop trong suốt cho Windows. Tauri 2 (Rust) giữ cửa sổ, Vue 3 vẽ bot.

## Cần có

- Node.js 22 trở lên
- pnpm 11 (`npm install -g pnpm`)
- Rust stable, target `x86_64-pc-windows-msvc` ([rustup](https://rustup.rs))
- Visual Studio Build Tools, workload **Desktop development with C++**
- WebView2 (Windows 11 đã có sẵn)

## Chạy

```powershell
pnpm install
pnpm tauri:dev
```

Lệnh khác:

```powershell
pnpm dev          # chỉ giao diện, http://localhost:5191
pnpm test
pnpm tauri:build  # bộ cài trong src-tauri/target/release/bundle
```

## Cấu trúc

| | |
|---|---|
| `src/` | Controller, hub, settings |
| `engine/` | Engine vẽ bot (không phụ thuộc repo khác) |
| `src-tauri/` | Cửa sổ, click-through, gaze, idle |
| `docs/` | Kế hoạch và nhật ký |

Engine gốc là [bloub](https://github.com/jeremy-prt/bloub). Bản trong `engine/` là bản đóng gói để repo này chạy một mình.
