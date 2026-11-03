package com.fct.gardendless

import android.content.Context
import android.os.Handler
import android.os.Looper
import android.util.AttributeSet
import android.view.InputDevice
import android.view.MotionEvent
import android.webkit.WebView
import kotlin.math.abs

/**
 * 把触摸手势转换为鼠标事件，供游戏使用。
 *
 * 事件注入分两条路径：
 * - 移动与滚轮使用 native MotionEvent（SOURCE_MOUSE），以保证流畅度；
 * - 左键按下/抬起与右键点击使用 JS MouseEvent，直接派发到 GameCanvas。
 *
 * 手势映射：
 * - 单指拖动：左键按下 → 移动 → 抬起；
 * - 双指滑动：以两指中点作为光标位置，纵向位移映射为滚轮；
 * - 双指轻点（位移未超过 moveThreshold）：右键点击。
 */
class MouseGameWebView @JvmOverloads constructor(
    context: Context, attrs: AttributeSet? = null
) : WebView(context, attrs) {

    private val mainHandler = Handler(Looper.getMainLooper())
    private var isDragging = false
    private var lastScrollY = 0f
    private var touchStartCenterX = 0f
    private var touchStartCenterY = 0f
    private var hasMovedEnough = false
    private val moveThreshold = 20f
    private var maxTouches = 0
    private var isTouching = false
    private var lastX = 0f
    private var lastY = 0f

    // 获取屏幕密度，用于将物理像素转换为CSS像素
    private val density = context.resources.displayMetrics.density

    override fun dispatchTouchEvent(event: MotionEvent): Boolean {
        if (event.source == InputDevice.SOURCE_MOUSE) {
            return super.dispatchTouchEvent(event)
        }

        val action = event.actionMasked
        val pointerCount = event.pointerCount
        if (pointerCount > maxTouches) maxTouches = pointerCount

        when (action) {
            MotionEvent.ACTION_DOWN -> {
                if (pointerCount == 1) {
                    isTouching = true
                    val dx = event.x
                    val dy = event.y
                    lastX = dx
                    lastY = dy

                    if (maxTouches == 1) {
                        // 关键：先把光标移到落点。
                        // 游戏（PvZ2 本体逻辑）用最近一次 mousemove 维护自己的光标，
                        // 只有 mousedown 而不先 mousemove 的话，放置植物 / 选卡 / 点僵尸
                        // 会按"上一次光标位置"命中——也就是手指抬起来看着点中了，
                        // 实际作用在上一处。
                        injectJsMouseEvent(dx, dy, "mousemove", 0, 0)
                        injectJsMouseEvent(dx, dy, "mousedown", 0, 1)
                        isDragging = true
                    }
                }
            }

            MotionEvent.ACTION_POINTER_DOWN -> {
                if (pointerCount == 2) {
                    // 进入双指手势：先把可能按住的左键松开，否则会一直处于拖拽状态
                    if (isDragging) {
                        injectJsMouseEvent(lastX, lastY, "mouseup", 0, 0)
                    }
                    isDragging = false
                    hasMovedEnough = false
                    val cx = (event.getX(0) + event.getX(1)) / 2
                    val cy = (event.getY(0) + event.getY(1)) / 2
                    touchStartCenterX = cx
                    touchStartCenterY = cy
                    lastScrollY = cy

                    // 双指按下瞬间，先在两指中点补发一次 native 移动
                    injectMouseEventAt(cx, cy, MotionEvent.ACTION_MOVE, MotionEvent.BUTTON_PRIMARY)
                }
            }

            MotionEvent.ACTION_MOVE -> {
                // 移动统一使用 native 事件，以保证流畅度
                if (pointerCount == 1 && isDragging) {
                    lastX = event.x
                    lastY = event.y
                    injectMouseEventAt(event.x, event.y, MotionEvent.ACTION_MOVE, MotionEvent.BUTTON_PRIMARY)
                } else if (pointerCount == 2) {
                    val cx = (event.getX(0) + event.getX(1)) / 2
                    val cy = (event.getY(0) + event.getY(1)) / 2
                    val deltaTotal = abs(cy - touchStartCenterY)

                    if (hasMovedEnough || deltaTotal > moveThreshold) {
                        hasMovedEnough = true
                        val scrollDelta = cy - lastScrollY
                        // 滚轮使用 native 事件
                        injectScrollEventAt(touchStartCenterX, touchStartCenterY, scrollDelta * 2)
                        lastScrollY = cy
                    }
                }
            }

            MotionEvent.ACTION_UP -> {
                isTouching = false
                mainHandler.removeCallbacksAndMessages(null)

                if (maxTouches == 1 && isDragging) {
                    // 抬起前再把光标对齐到最终落点（拖动后位置会变），然后松开左键
                    injectJsMouseEvent(event.x, event.y, "mousemove", 0, 0)
                    injectJsMouseEvent(event.x, event.y, "mouseup", 0, 0)
                    isDragging = false
                } else if (maxTouches == 2 && !hasMovedEnough) {
                    // 双指轻点：右键点击（先定位光标再按右键）
                    injectJsMouseEvent(touchStartCenterX, touchStartCenterY, "mousemove", 0, 0)
                    injectRightClickAt(touchStartCenterX, touchStartCenterY)
                } else if (isDragging) {
                    // 兜底：无论走哪条分支都不要把左键留在按下状态
                    injectJsMouseEvent(event.x, event.y, "mouseup", 0, 0)
                    isDragging = false
                }

                maxTouches = 0
                hasMovedEnough = false
            }

            MotionEvent.ACTION_CANCEL -> {
                // 手势被系统打断（来电、通知栏等）时也要释放按键
                if (isDragging) {
                    injectJsMouseEvent(lastX, lastY, "mouseup", 0, 0)
                }
                isDragging = false
                isTouching = false
                hasMovedEnough = false
                maxTouches = 0
                mainHandler.removeCallbacksAndMessages(null)
            }
        }

        // 原始触摸事件必须继续派发给 WebView：gp-next 的浮层（F9 按钮等）是普通
        // DOM 元素，靠 touchend/click 工作；游戏画布上的触摸已由页面里的 capture
        // 监听拦掉，不会重复触发。
        return super.dispatchTouchEvent(event)
    }

    /**
     * 向页面注入 JS MouseEvent，并直接派发到 GameCanvas。
     *
     * @param x 物理像素 X 坐标
     * @param y 物理像素 Y 坐标
     * @param type 事件类型，"mousedown" 或 "mouseup"
     * @param button 按键：0=左键，2=右键
     */
    private fun injectJsMouseEvent(
        x: Float,
        y: Float,
        type: String,
        button: Int,
        buttons: Int = if (type == "mouseup") 0 else if (button == 2) 2 else 1
    ) {
        // 将物理坐标转换为 CSS 坐标
        val cssX = x / density
        val cssY = y / density

        // 走页面里的逐帧队列（__gdInput）：每次按下前保证光标已刷新过；
        // 队列缺失时退化为直接派发。
        val js = """
            (function() {
                if (window.__gdInput) {
                    window.__gdInput('$type', $cssX, $cssY, $x, $y, $button, $buttons);
                    return;
                }
                var el = document.getElementById("GameCanvas");
                if (!el) return;
                el.dispatchEvent(new MouseEvent('$type', {
                    view: window, bubbles: true, cancelable: true,
                    screenX: $x, screenY: $y,
                    clientX: $cssX, clientY: $cssY,
                    button: $button, buttons: $buttons
                }));
            })();
        """.trimIndent()

        this.evaluateJavascript(js, null)
    }

    /** 注入 native 鼠标事件，用于移动 */
    private fun injectMouseEventAt(x: Float, y: Float, action: Int, buttonState: Int) {
        val props = arrayOf(MotionEvent.PointerProperties().apply { id = 0; toolType = MotionEvent.TOOL_TYPE_MOUSE })
        val coords = arrayOf(MotionEvent.PointerCoords().apply { this.x = x; this.y = y })
        val ev = MotionEvent.obtain(
            System.currentTimeMillis(), System.currentTimeMillis(), action,
            1, props, coords, 0, buttonState, 1f, 1f, 0, 0, InputDevice.SOURCE_MOUSE, 0
        )
        super.dispatchTouchEvent(ev)
        ev.recycle()
    }

    /** 注入 native 滚轮事件，用于双指滑动 */
    private fun injectScrollEventAt(x: Float, y: Float, delta: Float) {
        val props = arrayOf(MotionEvent.PointerProperties().apply { id = 0; toolType = MotionEvent.TOOL_TYPE_MOUSE })
        val coords = arrayOf(MotionEvent.PointerCoords().apply {
            this.x = x; this.y = y
            setAxisValue(MotionEvent.AXIS_VSCROLL, delta / 15f)
        })
        val ev = MotionEvent.obtain(
            System.currentTimeMillis(), System.currentTimeMillis(), MotionEvent.ACTION_SCROLL,
            1, props, coords, 0, 0, 1f, 1f, 0, 0, InputDevice.SOURCE_MOUSE, 0
        )
        super.dispatchGenericMotionEvent(ev)
        ev.recycle()
    }

    /** 右键点击：只注入 JS 的按下与抬起 */
    private fun injectRightClickAt(x: Float, y: Float) {
        // 备选方案：先以 native 事件把光标移到目标位置（当前未启用）
        // injectMouseEventAt(x, y, MotionEvent.ACTION_MOVE, MotionEvent.BUTTON_PRIMARY)
        injectJsMouseEvent(x, y, "mousedown", 2)
        injectJsMouseEvent(x, y, "mouseup", 2)
    }
}