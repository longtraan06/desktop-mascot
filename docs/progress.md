# Nhật Ký Tiến Độ Dự Án: Desktop Mascot Framework

## 1. Trạng Thái: ĐÃ SỬA CLICK-THROUGH, KÉO THẢ VÀ ÁNH NHÌN

Phần này chỉ ghi ba lỗi tương tác đã vá lúc đầu. Các đợt sau nằm ở [dieu-chinh.md](dieu-chinh.md). Không phải toàn bộ kế hoạch đã xong.

---

## 2. Chi Tiết Lỗi Phát Hiện & Giải Pháp Kỹ Thuật Đã Triển Khai

### Lỗi 1: Mắt Mascot Không Follow Theo Chuột
- **Nguyên nhân**: `BloubBot.vue` ban đầu chỉ lắng nghe sự kiện `pointermove` cục bộ trong DOM của cửa sổ (460x520px). Khi chuột di chuyển ra ngoài vùng cửa sổ, sự kiện `pointerleave` kích hoạt khiến `pointer = null` và mắt bot bị giật về vị trí trung tâm.
- **Giải pháp**:
  - `App.vue` tính toán góc nhìn trong không gian màn hình thực tế: lấy toạ độ phần cứng Win32 `GetCursorPos` trừ đi toạ độ tâm bot `(win.outerPosition() + botOffset)`.
  - Tích hợp hàm `mascot.getGaze` trực tiếp vào prop `:gaze` của `BloubBot.vue` với cờ `:follow="false"`.
  - Thuật toán nội suy mượt mà (damping 0.2) giúp mắt liếc tự nhiên theo chuột ở tốc độ 40 FPS trên cả 2 màn hình.

### Lỗi 2: Bị Khóa Chuột Vĩnh Viễn Sau Khi Hover Lần Đầu
- **Nguyên nhân**: `MascotBot.vue` trước đây gọi `set_click_through(true)` khi chuột rời thân bot (`onMouseLeave`). Trên Windows, khi cửa sổ bật cờ `WS_EX_TRANSPARENT`, hệ điều hành sẽ chuyển toàn bộ sự kiện chuột xuống các cửa sổ phía dưới. Vì vậy, Webview **không bao giờ nhận lại được sự kiện `mouseenter` nữa**, khiến bot bị tê liệt hoàn toàn.
- **Giải pháp**:
  - Chuyển toàn bộ logic hit-testing sang **Native Hit-Testing Thread trong Rust** (`src/lib.rs`):
    - Chạy chu kỳ 25ms ở tầng native OS.
    - Sử dụng `GetCursorPos` (hoàn toàn độc lập với trạng thái transparent của cửa sổ).
    - Tính toán khoảng cách `dist(cursor, bot_center) <= radius + 25px`.
    - Tự động bật `set_ignore_cursor_events(false)` khi chuột chạm bot, và bật `set_ignore_cursor_events(true)` khi chuột ra ngoài.
    - Khi Cửa sổ Chat & Settings mở (`hub_open = true`), giữ nguyên trạng thái tương tác để gõ phím và bấm nút bình thường.

### Lỗi 3: Kéo Thả Cửa Sổ Bị Kẹt
- **Giải pháp**:
  - Chuyển sang cơ chế native `data-tauri-drag-region` của Tauri trên thân bot.
  - Nhấp chuột nhanh -> Kích hoạt phản xạ `mascot.poke()` (nháy mắt vui vẻ).
  - Nhấp giữ và kéo -> Kéo cửa sổ di chuyển mượt mà trên desktop.
  - Chuột phải -> Mở / Đóng Cửa sổ Chat & Cài đặt.

---

## 3. Kết Quả Kiểm Thử (Verification Results)

- **Unit Tests `desktop-mascot`**: **9/9 tests PASS** (1.03s).
- **Unit Tests gốc `bloub`**: **211/211 tests PASS** (5.45s).
- **Frontend Build (`vue-tsc --noEmit && vite build`)**: Thành công, 0 lỗi TypeScript.
- **Rust Tauri Check (`cargo check`)**: Thành công trong 0.69s, 0 lỗi Rust.
