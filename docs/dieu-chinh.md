# Điều chỉnh Desktop Mascot

Theo dõi lệch giữa code và [plan.md](plan.md). Mỗi đợt sửa một cụm file. Không gộp đợt.

Trạng thái: `todo` · `doing` · `done`. Khi xong một mục, đổi `[ ]` thành `[x]` và ghi ngày ở đầu đợt.

Thứ tự: 1 → 2, và 3 → 4. Đợt 5 và 6 cần store / hit-test của đợt 4 và 3. Đợt 7, 8 làm độc lập. Đợt 9 để cuối.

---

## Đợt 1 — Hợp đồng controller `done` (2026-10-14)

Một lần trong `MascotController.ts`, `types.ts`, `MascotController.test.ts`.

- [x] `speak()` không kẹt khi không có `HTMLAudioElement`. `AudioBuffer` và `string` có đường xử lý hoặc bị từ chối rõ, không nuốt. `onComplete` luôn chạy khi kết thúc.
- [x] Timer ngủ không bật trong lúc nói. Đặt `isSpeaking` trước khi reset timer.
- [x] `listen()` chỉ `isListening` sau khi mic mở được. Lỗi `getUserMedia` tắt trạng thái. Gọi `onAudioData` / `onStop`.
- [x] `think()` có điểm kết thúc (`resetToIdle` hoặc hàm riêng). Hub không để `isThinking` true mãi.
- [x] `setState(duration)` resolve cả khi bị `setState` khác hoặc `resetToIdle` cắt.
- [x] Hết state có thời hạn thì trả `expression` về `restExpression` (poke, wake).
- [x] Thêm `setSize`, `setShape`, `setColor`, `undock`, `moveTo`, `dragStart`, `dragEnd`. `lookAt` được nối hoặc xóa. `dock()` chưa cần dịch cửa sổ (đợt 4).

Xong khi: test khóa speak không audio, listen lỗi, promise `setState` bị cắt, expression sau poke.

## Đợt 2 — Vật lý và nhịp thở `done` (2026-10-14)

Sau đợt 1. `PhysicsGesture.ts`, `AudioReactiveEngine.ts`, `MascotBot.vue`, test tương ứng.

- [x] Kéo native cập nhật vận tốc (`dragStart` / `dragEnd` hoặc delta vị trí cửa sổ). Bỏ một trong hai đường `data-tauri-drag-region` và `start_drag`.
- [x] Squash, recoil và `smoothedAmplitude` chạy theo rAF, không `computed` trên số thường.
- [x] Bỏ `transition: transform 0.05s` trên thân bot.
- [x] Thêm `AudioReactive.test.ts` (plan yêu cầu, file chưa có).

Xong khi: kéo nhanh thì thân dãn theo hướng kéo, thả thì nảy, mic hoặc audio làm thân phập mà không cần đổi state Vue khác.

## Đợt 3 — Hit-test và ánh nhìn `done` (2026-10-14)

Một lần trong `src-tauri/src/lib.rs` và `App.vue`.

- [x] Một vòng native vừa hit-test vừa gaze. Bỏ poll `invoke('get_mascot_gaze')` 40 lần/giây.
- [x] Gọi API cửa sổ trên main thread. Dừng thread khi app thoát.
- [x] Hit-test theo profile hình (`goutte`, `triangle`, …), không chỉ hình tròn.
- [x] Vùng bong bóng chỉ bật khi bubble hiện. Hub mở thì chỉ panel hub và thân bot nhận chuột, không cả cửa sổ 460×520.
- [x] Yaw/pitch không vượt ±16 / ±13. Chuẩn hóa theo kích thước màn hình thật, không hộp 900×540.
- [x] `GetAsyncKeyState` không khóa hit-test khi người dùng giữ chuột ở app khác.

Xong khi: click xuyên vùng trong suốt, trúng thân đúng hình, bubble ẩn không nuốt click, mắt không lọt sau vành trên màn lớn.

## Đợt 4 — Vị trí, đa màn hình, hít mép `done` (2026-10-14)

Sau đợt 3. Rust (monitor + `set_position`), Tauri store, controller.

- [x] Lưu `(x, y)`, monitor, size, shape, màu, options vào `mascot-settings.json`. Mở lại đúng chỗ. `localStorage` không còn là nguồn chính.
- [x] Biên từng màn hình. Kéo sang màn 2, dock theo mép màn đó. `moveTo` dùng được.
- [x] Sát mép (&lt; 30px) thì hít, thu nửa thân, chỉ thò mắt. Rê lại gần thì trồi ra. `undock()` kéo ra.
- [x] Tâm hit-test và gaze khớp bot sau khi cửa sổ đổi kích hoặc dock.

Xong khi: tắt app, mở lại đúng màn và đúng tọa độ. Kéo sát mép thì peek, không tính theo cửa sổ 460px như thể đó là kích thước bot.

## Đợt 5 — Hành vi hệ thống `done` (2026-10-14)

Sau store ở đợt 4. Rust (idle + fullscreen) và `SettingsPanel.vue`.

- [x] Idle thật (`GetLastInputInfo` hoặc tương đương). Di chuột hoặc gõ phím toàn hệ thống reset và đánh thức. Kéo bot cũng tính là hoạt động.
- [x] UI ngủ: 5 phút / 10 phút / tắt. Hết giờ thì `sleep()`, có chuột thì `wakeUp()`.
- [x] `autoHideFullscreen` ẩn khi có app toàn màn hình, hiện lại khi thoát. Không chỉ lưu checkbox.
- [x] Autostart đọc lại trạng thái OS lúc mở, không lệch checkbox.

Xong khi: không đụng bot nhưng di chuột thì không ngủ. Bật game exclusive thì mascot biến mất.

## Đợt 6 — Hub `done` (2026-10-14)

Sau đợt 3 (hit-test nhận rect). `MascotHub.vue`, `App.vue`, có thể nới cửa sổ trong Rust.

- [x] Panel lật trái/phải/trên/dưới để không tràn màn.
- [x] Click ra ngoài đóng hub. Esc và nút đóng giữ nguyên.
- [x] Bot 220px và panel cao không bị cắt trong 460×520. Một cửa sổ co theo nội dung, hoặc hub là cửa sổ riêng. Chọn một, không để cả hai nửa vời.

Xong khi: mở hub sát góc màn hình vẫn đọc hết panel. Click desktop đóng hub và click xuyên trở lại.

## Đợt 7 — Bubble và chat an toàn `done` (2026-10-14)

Độc lập. `SpeechBubble.vue`, `MascotHub.vue`, `tauri.conf.json`. Không gắn LLM.

- [x] Bỏ `v-html` nối chuỗi. Markdown tối thiểu qua render an toàn, hoặc text thuần.
- [x] CSP không để `null` khi bubble nhận nội dung ngoài.
- [x] Phản hồi giả của hub đi qua `appendBubbleToken`, để API streaming được dùng thật.

Xong khi: chuỗi `<img onerror>` trong tin nhắn không chạy script.

## Đợt 8 — Hình trên desktop trong suốt `done` (2026-10-14)

Độc lập. `MascotBot.vue`, `SettingsPanel.vue`. Không đổi số đo trong `src/bot/`.

- [x] Mắt không dính `paper` `#f9f9f9`. Lỗ trong suốt thấy desktop, hoặc một màu mắt chọn rõ. Không để mặc định ngầm.
- [x] Settings nói rõ hình người chọn chỉ giữ ở state `baseBody` (`idle`, `wink`, `wide`, `notify`). `thinking` / `sleep` / `play` lấy silhouette của state.

Xong khi: đổi wallpaper thấy đúng chủ đích ở mắt. Đổi sang `thinking` không trông như mất shape mà không giải thích.

## Đợt 9 — Phím tắt, test, doc `done` (2026-10-14)

Để cuối.

- [x] `register` lỗi thì hiện được, không `catch` rỗng. `unregister` khi unmount. Boss key có đường trên web dev.
- [x] Phím tắt vẫn cố định `Ctrl+Shift+Space` và `Ctrl+Shift+H` (plan không yêu cầu ghi lại phím). UI đọc đúng tổ hợp đang đăng ký.
- [x] Test đợt 1–8 còn thiếu thì bù. Không tính test hàm thuần khi UI không gọi hàm đó.
- [x] `progress.md` bỏ câu «100% hoàn chỉnh». `plan.md` sửa tên hình cho khớp `skins.ts`: `cercle`, `galet`, `squircle`, `capsule`, `triangle`, `hexagone`, `nuage`, `goutte`.
- [x] `MascotStudio.vue` không làm, trừ khi cần sandbox sau này.

Xong khi: `pnpm test` trong `desktop-mascot` chạy được với `vitest` và `happy-dom` khai báo trong package đó, không dựa hoisting tình cờ.

---

## Ngoài đợt

Không sửa trong các đợt trên: backend LLM, STT, TTS thật. API `speak` / `listen` / `think` / `appendBubbleToken` chỉ cần đúng hợp đồng để cắm sau.
