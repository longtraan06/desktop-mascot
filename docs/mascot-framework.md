# Bloub Desktop Mascot Framework: Hướng Dẫn Kỹ Thuật & Tích Hợp AI Chatbot

## 1. Giới thiệu Tổng quan
**Desktop Mascot Framework** là một khuôn mẫu hoàn chỉnh biến avatar bot toán học của `bloub` thành một người bạn đồng hành sống động trên màn hình máy tính Windows.

Được xây dựng trên nền tảng **Tauri v2 (Rust)** kết hợp **Vue 3 (TypeScript) & SVG thuần túy**, framework này sở hữu:
- **Tiêu thụ tài nguyên siêu thấp**: Chỉ ~15–25 MB RAM khi chạy ngầm 24/7.
- **Cửa sổ nổi trong suốt (Transparent & Frameless)**: Không viền, luôn nổi (Always-On-Top), hỗ trợ kéo thả tự do.
- **Click-Through thông minh**: Chuột click xuyên thấu vùng trong suốt xung quanh, chỉ nhận tương tác khi bấm trúng thân bot.
- **Tương tác Vật lý (Squash & Stretch)**: Thân bot biến dạng quán tính khi kéo và nảy đàn hồi (elastic recoil) khi buông chuột.
- **Hít mép màn hình (Edge Docking & Peek)**: Tự động hít vào cạnh màn hình và chỉ thò mắt ra ngó nghiêng để tiết kiệm không gian.
- **Audio-Reactive Engine**: Co bóp nhịp thở và mở to mắt theo biên độ âm thanh từ Micro và giọng nói TTS mà không cần vẽ thêm miệng.
- **Cửa sổ Đa năng (Chat & Settings Hub)**: Hỗ trợ hội thoại token streaming và tùy biến kích thước, hình dáng, màu sắc, phím tắt.

---

## 2. Đặc Tả Mascot Controller API

Toàn bộ hoạt động của Mascot được điều khiển thông qua singleton `mascot` từ module:
```typescript
import { mascot } from '@/controller/MascotController'
```

### Bảng phương thức điều khiển chính:

| Phương thức | Tham số | Mô tả |
|---|---|---|
| `mascot.setState(state, duration?)` | `state: StateId`, `duration?: number` (giây) | Đổi trạng thái animation (`idle`, `thinking`, `wink`, `wide`, `alert`, `notify`, `play`, `orbit`, `burst`, `sleep`, v.v.). Nếu truyền `duration`, sau khoảng thời gian đó bot sẽ tự động trở về `idle`. |
| `mascot.setExpression(expr)` | `expr: ExpressionId` | Đổi biểu cảm mắt (`neutre`, `heureux`, `attentif`, `surpris`, `curieux`, `fier`, `timide`, `somnolent`, v.v.). |
| `mascot.resetToIdle()` | Không | Đưa bot trở về trạng thái nghỉ chuẩn mực. |
| `mascot.speak(options)` | `{ text?, audioSource?, onComplete? }` | Kích hoạt trạng thái nói: hiển thị bong bóng chat, kết nối audio element để thân bot phập phồng theo âm thanh TTS, tự động trở về idle khi kết thúc. |
| `mascot.stopSpeaking()` | Không | Dừng nói và tắt phân tích âm thanh. |
| `mascot.listen(options?)` | `{ onAudioData?, onStop? }` | Kích hoạt micro: mắt mở to chăm chú, viền phát xung năng lượng dao động theo âm lượng giọng nói của người dùng. |
| `mascot.stopListening()` | Không | Tắt thu âm micro và đưa bot về trạng thái nghỉ. |
| `mascot.think(taskName?)` | `taskName?: string` | Bot vào trạng thái suy nghĩ (`thinking`), hiển thị bong bóng trạng thái tác vụ. |
| `mascot.poke()` | Không | Phản xạ khi người dùng click vào thân bot (nháy mắt vui vẻ hoặc thức dậy). |
| `mascot.sleep()` / `wakeUp()` | Không | Đưa bot vào giấc ngủ hoặc đánh thức bot dậy. |
| `mascot.showBubble(text, opts?)` | `text: string`, `options?: { autoHideMs? }` | Hiển thị bong bóng chat với hỗ trợ Markdown. |
| `mascot.appendBubbleToken(token)`| `token: string` | Nối từng token chữ vào bong bóng thoại (hiệu ứng streaming token của LLM). |
| `mascot.hideBubble()` | Không | Đóng bong bóng thoại. |
| `mascot.openHub(tab?)` | `tab?: 'chat' \| 'settings'` | Mở Cửa sổ Chat hoặc Cài đặt. |
| `mascot.closeHub()` | Không | Đóng cửa sổ Chat & Cài đặt. |
| `mascot.toggleHub()` | Không | Bật / tắt nhanh cửa sổ. |

---

## 3. Hướng Dẫn Tích Hợp AI Chatbot (Plug-and-Play)

Khi bạn muốn tích hợp bất kỳ AI backend nào vào sau này (Gemini, Claude, Whisper, Ollama, LangChain), bạn chỉ cần gọi API của Mascot như các ví dụ mẫu dưới đây:

### Ví dụ 1: Tích hợp với LLM Streaming Response (OpenAI / Gemini / Ollama)
```typescript
import { mascot } from '@/controller/MascotController'

async function handleUserPrompt(prompt: string) {
  // 1. Cho bot vào trạng thái suy nghĩ
  mascot.think('Đang xử lý câu hỏi')

  // 2. Gọi API LLM dạng streaming
  const response = await fetch('/api/chat', {
    method: 'POST',
    body: JSON.stringify({ prompt })
  })

  // 3. Chuẩn bị hiển thị câu trả lời
  mascot.showBubble('')
  mascot.setState('play', 1.0) // Nháy mắt vui vẻ khi bắt đầu có câu trả lời

  const reader = response.body?.getReader()
  const decoder = new TextDecoder()

  while (true) {
    const { done, value } = await reader!.read()
    if (done) break
    const chunk = decoder.decode(value)
    // 4. Bắn từng token vào mascot để hiển thị mượt mà
    mascot.appendBubbleToken(chunk)
  }

  // 5. Kết thúc câu trả lời
  mascot.resetToIdle()
}
```

### Ví dụ 2: Tích hợp Giọng Nói TTS & STT (Voice Assistant)
```typescript
import { mascot } from '@/controller/MascotController'

async function startVoiceConversation() {
  // Bật chế độ lắng nghe giọng nói của người dùng
  await mascot.listen()

  // Thu âm và gửi đến Whisper API...
  const audioBlob = await recordUserSpeech()
  mascot.stopListening()

  mascot.think('Đang chuyển giọng nói thành văn bản')
  const userText = await whisperSTT(audioBlob)

  // Gọi LLM sinh câu trả lời và chuyển thành file âm thanh TTS
  const { replyText, ttsAudioUrl } = await generateResponse(userText)

  // Phát âm thanh TTS: thân bot sẽ tự động co bóp nảy nhịp nhàng theo âm lượng
  const audio = new Audio(ttsAudioUrl)
  await mascot.speak({
    text: replyText,
    audioSource: audio,
    onComplete: () => {
      console.log('Bot đã nói xong!')
    }
  })
}
```

---

## 4. Các Lệnh Chạy Dự Án

Trong thư mục `desktop-mascot`:
```powershell
# Chạy giao diện Web Dev (Mô phỏng trên trình duyệt tại port 5191)
pnpm dev

# Chạy ứng dụng Desktop Tauri v2 hoàn chỉnh (Cửa sổ nổi trong suốt trên Windows)
pnpm tauri:dev

# Kiểm tra Unit Tests
pnpm test

# Build bộ cài đặt Desktop Mascot .exe
pnpm tauri:build
```
