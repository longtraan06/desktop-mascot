# Handoff: Bloub Desktop Mascot

Tài liệu này là bản giao cho người nhận project. Nó mô tả app đang làm được gì, code nằm ở đâu, và chỗ nào cố ý chưa làm.

Repo này chạy một mình. Không cần clone repo `bloub` gốc.

## App này là gì

Một mascot desktop trên Windows. Cửa sổ trong suốt, không viền, luôn nổi. Bot vẽ bằng SVG. Chuột chỉ dính khi trúng thân, bong bóng hoặc hub. Chỗ trong suốt click xuyên xuống app bên dưới.

Hai tầng:

| Tầng | Việc |
|---|---|
| `src-tauri/` (Rust, Tauri 2) | Cửa sổ, click-through, gaze, idle, ẩn khi có app toàn màn hình, tray |
| `src/` (Vue 3 + TS) | Trạng thái bot, hub chat/settings, kéo, hít mép |
| `engine/` | Engine vẽ bot, copy từ [bloub](https://github.com/jeremy-prt/bloub) để repo không phụ thuộc chỗ khác |

Singleton điều khiển: `import { mascot } from './controller/MascotController'`.

## Chạy

Cần Node 22+, pnpm 11, Rust MSVC, WebView2.

```powershell
pnpm install
pnpm tauri:dev      # app desktop
pnpm dev            # chỉ web, http://localhost:5191
pnpm test           # 37 test
pnpm tauri:build    # bộ cài ở src-tauri/target/release/bundle
```

`pnpm dev` không có click-through, đa màn hình, idle hệ thống hay ẩn game. Những thứ đó chỉ có trong Tauri.

## Người dùng làm được gì

- Kéo bot. Thân dãn theo hướng kéo, thả thì nảy nhẹ.
- Thả sát mép trái, phải hoặc đáy (dưới 30px so với thân, không phải khung cửa sổ) thì hít mép, hơn nửa thân thụt ra ngoài. Rê chuột lại gần thì trồi ra. `undock()` kéo vào.
- Click trái: nháy mắt. Nếu đang ngủ thì thức.
- Chuột phải hoặc `Ctrl+Shift+Space`: mở hub. `Esc`, nút đóng, hoặc click ra ngoài thì đóng.
- `Ctrl+Shift+H`: ẩn / hiện cửa sổ. Trên web dev, phím này ẩn bot trong trang.
- Hub có chat giả (stream từng token) và settings.
- Settings: cỡ 80–220px, 8 hình (`cercle`, `galet`, `squircle`, `capsule`, `triangle`, `hexagone`, `nuage`, `goutte`), 12 màu, biểu cảm nghỉ, ngủ 5 phút / 10 phút / tắt, ẩn khi app phủ kín màn hình, khởi động cùng Windows.
- Hình đã chọn chỉ giữ ở `idle`, `wink`, `wide`, `notify`. `thinking`, `sleep`, `play` dùng silhouette của trạng thái.
- Mắt là lỗ trong suốt (`paper="transparent"`), thấy nền phía sau.
- Không đụng bot nhưng di chuột hoặc gõ phím ở app khác thì không ngủ. Hết giờ thì ngủ, có input thì thức.
- Cửa sổ phủ kín cả màn hình (không tính cửa sổ chỉ maximize còn taskbar) thì mascot ẩn, thoát thì hiện lại.
- Tắt app, mở lại đúng chỗ và đúng màn hình.
- Tray: hiện, ẩn, thoát.

## Cắm AI sau này

Chưa có LLM, STT hay TTS. Chat trong hub là câu trả lời giả, chỉ để API streaming chạy thật.

```ts
mascot.think('Đang xử lý')
mascot.showBubble('')
mascot.appendBubbleToken(token)   // gọi nhiều lần
mascot.stopThinking()

await mascot.speak({
  text: reply,
  audioSource: audioElement,       // HTMLAudioElement, URL, hoặc AudioBuffer
  onComplete: () => {}
})

await mascot.listen({
  onAudioData: (amplitude) => {},
  onStop: () => {}
})
```

`speak` không có audio thì vẫn kết thúc và gọi `onComplete`. Nguồn lạ thì ném `TypeError`. `listen` chỉ bật sau khi mic mở được.

Bubble và chat render `**đậm**`, `` `code` `` và xuống dòng bằng text node. Không có `v-html`. Chuỗi `<img onerror>` chỉ hiện là chữ.

## API controller

Trạng thái đọc được: `state`, `expression`, `size`, `shape`, `color`, `isSpeaking`, `isListening`, `isThinking`, `isSleeping`, `isDocked`, `dockSide`, `isHubOpen`, `hubTab`, `bubbleText`, `isBubbleVisible`, `settings`.

| Hàm | Việc |
|---|---|
| `setState(id, duration?)` | Đổi trạng thái. Có `duration` thì hết giờ về `idle` và trả biểu cảm nghỉ. Promise vẫn resolve nếu bị cắt. |
| `setExpression` / `setSize` / `setShape` / `setColor` | Đổi mặt và da. Size kẹp 80–220. |
| `resetToIdle` | Về nghỉ, tắt nói / nghe / nghĩ. |
| `think` / `stopThinking` | Trạng thái `thinking` và bubble tác vụ. |
| `speak` / `stopSpeaking` | Nói. Thân phập theo biên độ audio. |
| `listen` / `stopListening` | Mic. Gọi `onAudioData`. |
| `sleep` / `wakeUp` | Ngủ / thức. |
| `poke` | Click thân. |
| `dock(side)` / `undock()` | Cờ hít mép. `undock` trên desktop kéo bot vào màn. |
| `moveTo(x, y, monitorIndex?)` | Dời cửa sổ. Tọa độ là pixel vật lý, gốc cửa sổ. |
| `settleAfterDrag()` | Sau khi thả: nhớ chỗ, hoặc hít mép. |
| `lookAt(x, y)` / `updateGaze` / `getGaze` | Ánh nhìn. Yaw ±16, pitch ±13. |
| `dragStart` / `dragEnd` | Bắt đầu / kết thúc kéo. `dragEnd` gọi `settleAfterDrag`. |
| `openHub` / `closeHub` / `toggleHub` | Hub. |
| `showBubble` / `appendBubbleToken` / `hideBubble` | Bong bóng. |
| `hydrate` | Desktop: đọc `mascot-settings.json`, đặt lại cửa sổ. |
| `saveSettings` / `loadSettings` | Ghi cấu hình. Desktop dùng Tauri store. Web và test dùng `localStorage`. |

`getGaze` là hàm thuần thời gian, `BloubBot` gọi mỗi frame. Đừng đưa `Date.now()` hay state Vue vào engine.

## Rust đang giữ gì

Một vòng 25ms trên main thread (`on_pointer`):

- `GetCursorPos` → gaze theo kích thước màn hình thật, rồi bắn `mascot-gaze` (`yaw`, `pitch`, `x`, `y` của cửa sổ).
- Hit-test theo profile hình đang chọn, cộng vùng bubble và hub khi chúng đang hiện.
- Giữ click khi nút chuột nhấn bắt đầu trên bot, để kéo không bị cắt.
- Idle bằng `GetLastInputInfo`. Bắn `mascot-idle` và `mascot-activity`.
- App phủ kín màn hình thì ẩn cửa sổ. Có trễ vài nhịp để khỏi nhấp nháy. Không ẩn trong lúc đang kéo.
- Rê vào vùng mép khi đang dock thì bắn `mascot-undock`.

Lệnh JS gọi sang Rust: `set_bot_size`, `set_bot_anchor`, `set_hit_profile`, `set_bubble_rect`, `set_hub_rect`, `set_drag_engaged`, `set_dock_zone`, `set_idle_minutes`, `set_auto_hide`, `set_hub_open`, `get_mascot_gaze`, `get_global_cursor_pos`, `set_click_through`, `start_drag`.

Kéo thật sự không dùng `start_drag`. Hàm đó còn trong binary nhưng UI không gọi. Kéo đi bằng `setPosition` từ `pointermove`, vì `startDragging()` của Windows khóa luồng UI nên thân không dãn và hít mép không kịp chạy.

Sự kiện Rust → Vue:

| Sự kiện | Vue làm |
|---|---|
| `mascot-gaze` | Cập nhật mắt và vị trí cửa sổ đã biết |
| `mascot-idle` | `noteSystemIdle()` nếu không đang nói, nghe hay nghĩ |
| `mascot-activity` | `wakeUp()` nếu đang ngủ |
| `mascot-undock` | `undock()` |
| `mascot-dismiss` | `closeHub()` |

## Dữ liệu nhớ

Desktop: `mascot-settings.json` qua plugin store (thư mục data của app). Gồm size, hình, màu, biểu cảm nghỉ, ngủ, ẩn game, autostart, phím tắt, `lastX`, `lastY`, `monitorIndex`, `dockSide`.

Web và test: `localStorage` khóa `bloub-mascot-settings`.

Autostart lúc mở app đọc lại trạng thái OS, không tin checkbox cũ nếu OS đã khác.

## Việc không nằm trong app

- Không có model chat, Whisper, hay giọng TTS. Chỉ có hợp đồng `speak` / `listen` / `think` / `appendBubbleToken`.
- Không có `MascotStudio`.
- Phím tắt không đổi được. Cố định `Ctrl+Shift+Space` và `Ctrl+Shift+H`.
- Hit-test dùng hình trong settings, không phải silhouette đang morph của `thinking` hay `sleep`.
- `engine/` là bản đóng gói. Sửa số đo hình, mắt, thời gian trong đó là sửa bản đo của bloub, không phải tùy chỉnh mascot.

## File nên đọc trước khi sửa

| File | Vì sao |
|---|---|
| `src/controller/MascotController.ts` | Mọi hành vi |
| `src/App.vue` | Nối Rust, nới cửa sổ, hub |
| `src/components/MascotBot.vue` | Kéo |
| `src/controller/dock.ts` | Hít mép |
| `src/controller/hubLayout.ts` | Hub không tràn màn |
| `src-tauri/src/lib.rs` | Click-through, gaze, idle |
| `docs/dieu-chinh.md` | Nhật ký 9 đợt đã làm |
| `docs/plan.md` | Mục tiêu gốc, một phần đã cũ hơn code |
