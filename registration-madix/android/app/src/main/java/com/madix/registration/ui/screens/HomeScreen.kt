package com.madix.registration.ui.screens

import android.content.Intent
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.FiberManualRecord
import androidx.compose.material.icons.filled.Pause
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Stop
import androidx.compose.material.icons.filled.Visibility
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.madix.registration.record.RecorderController
import com.madix.registration.record.RecorderService
import com.madix.registration.ui.AppViewModel

@Composable
fun HomeScreen(
    appVm: AppViewModel,
    onStartRecording: () -> Unit,
    onStopRecording: () -> Unit,
) {
    val context = LocalContext.current
    val state by RecorderController.state.collectAsState()
    val elapsed by RecorderController.elapsedMs.collectAsState()
    val countdown by RecorderController.countdown.collectAsState()
    val liveViewers by RecorderController.liveViewers.collectAsState()
    val settings by appVm.settings.collectAsState()

    val recording = state == RecorderController.State.RECORDING
    val paused = state == RecorderController.State.PAUSED
    val active = recording || paused

    Box(modifier = Modifier.fillMaxSize()) {
        Column(
            modifier = Modifier.fillMaxSize().padding(24.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center,
        ) {
            if (active) {
                Text(
                    text = formatDuration(elapsed),
                    fontSize = 52.sp,
                    fontWeight = FontWeight.Bold,
                    color = MaterialTheme.colorScheme.onBackground,
                )
                Text(
                    text = if (paused) "متوقف مؤقتاً" else "جارٍ التسجيل",
                    color = if (paused) MaterialTheme.colorScheme.onSurfaceVariant else MaterialTheme.colorScheme.primary,
                    modifier = Modifier.padding(top = 4.dp),
                )
                AnimatedVisibility(visible = liveViewers > 0) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        modifier = Modifier.padding(top = 8.dp),
                    ) {
                        Icon(Icons.Filled.Visibility, contentDescription = null, modifier = Modifier.size(18.dp))
                        Text(" مشاهدة مباشرة الآن", style = MaterialTheme.typography.bodySmall)
                    }
                }
            } else {
                Text(
                    text = "جاهز للتسجيل",
                    style = MaterialTheme.typography.titleLarge,
                )
                Text(
                    text = audioSummary(settings.audioMode) + facecamSummary(settings.facecam),
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    style = MaterialTheme.typography.bodySmall,
                    modifier = Modifier.padding(top = 6.dp),
                )
            }

            // Big circular record / stop button.
            Box(
                modifier = Modifier
                    .padding(top = 40.dp)
                    .size(140.dp)
                    .clip(CircleShape)
                    .background(
                        if (active) MaterialTheme.colorScheme.surfaceVariant
                        else MaterialTheme.colorScheme.primary
                    ),
                contentAlignment = Alignment.Center,
            ) {
                if (active) {
                    Button(
                        onClick = onStopRecording,
                        shape = CircleShape,
                        colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.primary),
                        modifier = Modifier.size(96.dp),
                    ) {
                        Icon(Icons.Filled.Stop, contentDescription = "إيقاف", modifier = Modifier.size(40.dp))
                    }
                } else {
                    Button(
                        onClick = onStartRecording,
                        shape = CircleShape,
                        colors = ButtonDefaults.buttonColors(containerColor = Color.White),
                        modifier = Modifier.size(120.dp),
                    ) {
                        Icon(
                            Icons.Filled.FiberManualRecord,
                            contentDescription = "تسجيل",
                            tint = MaterialTheme.colorScheme.primary,
                            modifier = Modifier.size(56.dp),
                        )
                    }
                }
            }

            if (active) {
                Row(modifier = Modifier.padding(top = 32.dp)) {
                    OutlinedButton(
                        onClick = {
                            val action = if (paused) RecorderService.ACTION_RESUME else RecorderService.ACTION_PAUSE
                            context.startService(Intent(context, RecorderService::class.java).setAction(action))
                        },
                    ) {
                        Icon(
                            if (paused) Icons.Filled.PlayArrow else Icons.Filled.Pause,
                            contentDescription = null,
                        )
                        Text(if (paused) "  استئناف" else "  إيقاف مؤقت")
                    }
                }
            }
        }

        // Countdown overlay.
        if (state == RecorderController.State.COUNTDOWN && countdown > 0) {
            Box(
                modifier = Modifier.fillMaxSize().background(Color.Black.copy(alpha = 0.7f)),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    text = countdown.toString(),
                    fontSize = 96.sp,
                    fontWeight = FontWeight.Bold,
                    color = Color.White,
                )
            }
        }

        // Hint card at bottom.
        if (!active) {
            Card(
                modifier = Modifier
                    .align(Alignment.BottomCenter)
                    .fillMaxWidth()
                    .padding(16.dp),
                shape = RoundedCornerShape(16.dp),
            ) {
                Text(
                    text = "ملاحظة: نظام أندرويد يُظهر إشعاراً أثناء التسجيل ولا يمكن إخفاؤه. لا تظهر أي فقاعة أو عناصر داخل الفيديو.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(14.dp),
                )
            }
        }
    }
}

private fun formatDuration(ms: Long): String {
    val totalSec = ms / 1000
    val h = totalSec / 3600
    val m = (totalSec % 3600) / 60
    val s = totalSec % 60
    return if (h > 0) "%d:%02d:%02d".format(h, m, s) else "%02d:%02d".format(m, s)
}

private fun audioSummary(mode: String): String = when (mode) {
    "none" -> "بدون صوت"
    "internal" -> "صوت داخلي"
    "both" -> "مايك + صوت داخلي"
    else -> "مايك"
}

private fun facecamSummary(on: Boolean): String = if (on) " · كاميرا" else ""
