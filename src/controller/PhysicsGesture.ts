import type { ScreenDockSide } from '../types'

export interface DragTransform {
  scaleX: number
  scaleY: number
  rotationDeg: number
  offsetX: number
  offsetY: number
}

/**
 * PhysicsGesture
 * Tính toán phản lực quán tính (squash & stretch) khi kéo thả bot
 * và kiểm tra trạng thái hít mép màn hình (Edge Docking)
 */
export class PhysicsGesture {
  private isDragging = false
  private lastX = 0
  private lastY = 0
  private vx = 0
  private vy = 0
  
  // Damped oscillation after release
  private recoilTime = 0
  private recoilDuration = 0.35 // seconds
  private recoilAmp = 0

  public dockSide: ScreenDockSide = null

  public startDrag(clientX: number, clientY: number) {
    this.isDragging = true
    this.lastX = clientX
    this.lastY = clientY
    this.vx = 0
    this.vy = 0
    this.recoilAmp = 0
  }

  public updateDrag(clientX: number, clientY: number) {
    if (!this.isDragging) return
    const dx = clientX - this.lastX
    const dy = clientY - this.lastY

    // Smooth velocity calculation
    this.vx = this.vx * 0.6 + dx * 0.4
    this.vy = this.vy * 0.6 + dy * 0.4

    this.lastX = clientX
    this.lastY = clientY
  }

  public endDrag() {
    if (!this.isDragging) return
    this.isDragging = false

    const speed = Math.hypot(this.vx, this.vy)
    if (speed > 3) {
      // Trigger elastic recoil bounce
      this.recoilAmp = Math.min(speed * 0.03, 0.22)
      this.recoilTime = performance.now()
    }
  }

  /**
   * Tính toán biến dạng thân bot tại mỗi khung hình
   */
  public computeTransform(): DragTransform {
    if (this.isDragging) {
      const speed = Math.hypot(this.vx, this.vy)
      const angle = (Math.atan2(this.vy, this.vx) * 180) / Math.PI

      // Độ dãn theo chiều chuyển động (stretch), độ bẹp theo chiều vuông góc (squash)
      const stretch = Math.min(speed * 0.015, 0.25)
      return {
        scaleX: 1 + stretch,
        scaleY: 1 - stretch * 0.6,
        rotationDeg: angle,
        offsetX: this.vx * 0.5,
        offsetY: this.vy * 0.5
      }
    }

    // Elastic recoil sau khi buông chuột
    if (this.recoilAmp > 0.005) {
      const elapsed = (performance.now() - this.recoilTime) / 1000
      if (elapsed > this.recoilDuration) {
        this.recoilAmp = 0
      } else {
        const decay = Math.exp(-elapsed * 9)
        const bounce = Math.sin(elapsed * Math.PI * 8) * this.recoilAmp * decay
        return {
          scaleX: 1 + bounce,
          scaleY: 1 - bounce * 0.8,
          rotationDeg: 0,
          offsetX: 0,
          offsetY: 0
        }
      }
    }

    return {
      scaleX: 1,
      scaleY: 1,
      rotationDeg: 0,
      offsetX: 0,
      offsetY: 0
    }
  }

  /**
   * Kiểm tra xem toạ độ cửa sổ có nằm sát mép màn hình không (khoảng cách < 35px)
   */
  public checkDockEdge(windowX: number, windowY: number, screenW: number, screenH: number, botSize: number): ScreenDockSide {
    const threshold = 35
    if (windowX < threshold) {
      this.dockSide = 'left'
      return 'left'
    }
    if (windowX + botSize > screenW - threshold) {
      this.dockSide = 'right'
      return 'right'
    }
    if (windowY + botSize > screenH - threshold) {
      this.dockSide = 'bottom'
      return 'bottom'
    }
    this.dockSide = null
    return null
  }
}

const AUDIO_PULSE = 0.12

export function bodyTransform(drag: DragTransform, amplitude: number): string {
  const pulse = amplitude * AUDIO_PULSE
  const scaleX = drag.scaleX * (1 + pulse)
  const scaleY = drag.scaleY * (1 + pulse)
  return `translate(${drag.offsetX}px, ${drag.offsetY}px) rotate(${drag.rotationDeg}deg) scale(${scaleX}, ${scaleY})`
}
