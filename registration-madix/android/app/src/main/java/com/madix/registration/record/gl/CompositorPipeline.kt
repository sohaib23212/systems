package com.madix.registration.record.gl

import android.graphics.SurfaceTexture
import android.opengl.EGLSurface
import android.opengl.GLES20
import android.opengl.Matrix
import android.os.Handler
import android.os.HandlerThread
import android.view.Surface
import com.madix.registration.record.TimeBase
import java.util.concurrent.CountDownLatch

/**
 * Renders the screen (and optional facecam) into the encoder's input surface.
 *
 * The screen VirtualDisplay draws into [screenSurface]; the camera (if enabled)
 * draws into [cameraSurface]. Each screen frame triggers a composite + swap so
 * encoded frame pacing follows the screen.
 */
class CompositorPipeline(
    private val encoderSurface: Surface,
    private val width: Int,
    private val height: Int,
    private val facecam: Boolean,
    private val facecamFront: Boolean,
    private val timeBase: TimeBase,
) {
    lateinit var screenSurface: Surface
        private set
    var cameraSurface: Surface? = null
        private set

    private var thread: HandlerThread? = null
    private var handler: Handler? = null

    private lateinit var egl: EglCore
    private var windowSurface: EGLSurface? = null
    private lateinit var program: OesTextureProgram

    private var screenTexId = 0
    private lateinit var screenTexture: SurfaceTexture
    private val screenMatrix = FloatArray(16)

    private var cameraTexId = 0
    private var cameraTexture: SurfaceTexture? = null
    private val cameraMatrix = FloatArray(16)
    @Volatile private var cameraHasFrame = false

    private val cameraMvp = FloatArray(16)

    @Volatile private var released = false

    fun start() {
        val latch = CountDownLatch(1)
        thread = HandlerThread("gl-compositor").also { it.start() }
        handler = Handler(thread!!.looper)
        handler!!.post {
            initGl()
            latch.countDown()
        }
        latch.await()
    }

    private fun initGl() {
        egl = EglCore()
        windowSurface = egl.createWindowSurface(encoderSurface)
        egl.makeCurrent(windowSurface!!)
        program = OesTextureProgram()

        screenTexId = program.createOesTexture()
        screenTexture = SurfaceTexture(screenTexId).apply {
            setDefaultBufferSize(width, height)
            setOnFrameAvailableListener({ onScreenFrame() }, handler)
        }
        screenSurface = Surface(screenTexture)

        if (facecam) {
            cameraTexId = program.createOesTexture()
            cameraTexture = SurfaceTexture(cameraTexId).apply {
                setDefaultBufferSize(1280, 720)
                setOnFrameAvailableListener({ cameraHasFrame = true }, handler)
            }
            cameraSurface = Surface(cameraTexture)
            computeCameraMvp()
        }

        GLES20.glDisable(GLES20.GL_DEPTH_TEST)
        GLES20.glClearColor(0f, 0f, 0f, 1f)
    }

    private fun computeCameraMvp() {
        // Overlay occupies ~28% of the shorter edge, bottom-right with a margin.
        val frac = 0.28f
        val margin = 0.04f
        val cx = 1f - frac - margin
        val cy = -1f + frac + margin
        Matrix.setIdentityM(cameraMvp, 0)
        Matrix.translateM(cameraMvp, 0, cx, cy, 0f)
        Matrix.scaleM(cameraMvp, 0, frac, frac, 1f)
    }

    private fun onScreenFrame() {
        if (released) return
        val ws = windowSurface ?: return
        runCatching {
            screenTexture.updateTexImage()
            screenTexture.getTransformMatrix(screenMatrix)
        }
        if (facecam && cameraHasFrame) {
            runCatching {
                cameraTexture?.updateTexImage()
                cameraTexture?.getTransformMatrix(cameraMatrix)
                if (facecamFront) mirrorHorizontally(cameraMatrix)
            }
        }
        if (timeBase.paused) return

        egl.makeCurrent(ws)
        GLES20.glViewport(0, 0, width, height)
        GLES20.glClear(GLES20.GL_COLOR_BUFFER_BIT)

        program.draw(screenTexId, screenMatrix)
        if (facecam && cameraHasFrame) {
            program.draw(cameraTexId, cameraMatrix, cameraMvp)
        }

        val pts = timeBase.ptsUs(screenTexture.timestamp)
        egl.setPresentationTime(ws, pts * 1000L)
        egl.swapBuffers(ws)
    }

    private fun mirrorHorizontally(m: FloatArray) {
        // Flip the texture S coordinate around 0.5 for a natural front-facing view.
        val flip = FloatArray(16)
        Matrix.setIdentityM(flip, 0)
        Matrix.translateM(flip, 0, 1f, 0f, 0f)
        Matrix.scaleM(flip, 0, -1f, 1f, 1f)
        val result = FloatArray(16)
        Matrix.multiplyMM(result, 0, m, 0, flip, 0)
        System.arraycopy(result, 0, m, 0, 16)
    }

    fun stop() {
        released = true
        val h = handler ?: return
        val latch = CountDownLatch(1)
        h.post {
            runCatching { screenTexture.setOnFrameAvailableListener(null) }
            runCatching { cameraTexture?.setOnFrameAvailableListener(null) }
            runCatching { program.release() }
            runCatching { windowSurface?.let { egl.releaseSurface(it) } }
            runCatching { egl.release() }
            runCatching { screenSurface.release() }
            runCatching { cameraSurface?.release() }
            runCatching { screenTexture.release() }
            runCatching { cameraTexture?.release() }
            latch.countDown()
        }
        runCatching { latch.await() }
        runCatching { thread?.quitSafely() }
        thread = null
        handler = null
    }
}
