package com.madix.registration.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.horizontalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Logout
import androidx.compose.material3.Card
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.madix.registration.data.RecordSettings
import com.madix.registration.ui.AppViewModel

@Composable
fun SettingsScreen(appVm: AppViewModel) {
    val settings by appVm.settings.collectAsState()
    val session by appVm.session.collectAsState()

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .verticalScroll(rememberScrollState())
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        Text("الإعدادات", style = MaterialTheme.typography.titleLarge)

        Section("الصوت") {
            ChipRow(
                options = listOf("none" to "بدون", "mic" to "مايك", "internal" to "داخلي", "both" to "الاثنان"),
                selected = settings.audioMode,
                onSelect = { v -> appVm.updateSettings { it.copy(audioMode = v) } },
            )
        }

        Section("الدقة") {
            ChipRow(
                options = listOf(100 to "كاملة", 75 to "75%", 50 to "50%"),
                selected = settings.resolutionPercent,
                onSelect = { v -> appVm.updateSettings { it.copy(resolutionPercent = v) } },
            )
        }

        Section("عدد الإطارات") {
            ChipRow(
                options = listOf(30 to "30", 60 to "60"),
                selected = settings.fps,
                onSelect = { v -> appVm.updateSettings { it.copy(fps = v) } },
            )
        }

        Section("جودة الفيديو (ميغابت/ث)") {
            ChipRow(
                options = listOf(6 to "6", 8 to "8", 12 to "12", 20 to "20", 40 to "40"),
                selected = settings.bitrateMbps,
                onSelect = { v -> appVm.updateSettings { it.copy(bitrateMbps = v) } },
            )
        }

        Section("الكاميرا (facecam)") {
            SwitchRow("إظهار الكاميرا فوق التسجيل", settings.facecam) { on ->
                appVm.updateSettings { it.copy(facecam = on) }
            }
            if (settings.facecam) {
                ChipRow(
                    options = listOf(true to "أمامية", false to "خلفية"),
                    selected = settings.facecamFront,
                    onSelect = { v -> appVm.updateSettings { it.copy(facecamFront = v) } },
                )
            }
        }

        Section("العدّ التنازلي") {
            ChipRow(
                options = listOf(0 to "بدون", 3 to "3 ثوانٍ", 5 to "5 ثوانٍ"),
                selected = settings.countdownSeconds,
                onSelect = { v -> appVm.updateSettings { it.copy(countdownSeconds = v) } },
            )
        }

        Section("جودة البث المباشر") {
            Text("الإطارات/ث", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            ChipRow(
                options = listOf(3 to "3", 5 to "5", 8 to "8", 10 to "10"),
                selected = settings.liveFps,
                onSelect = { v -> appVm.updateSettings { it.copy(liveFps = v) } },
            )
            Text("أقصى عرض (بكسل)", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(top = 8.dp))
            ChipRow(
                options = listOf(360 to "360", 480 to "480", 720 to "720"),
                selected = settings.liveMaxWidth,
                onSelect = { v -> appVm.updateSettings { it.copy(liveMaxWidth = v) } },
            )
        }

        Section("خيارات") {
            SwitchRow("إيقاف تلقائي عند انخفاض البطارية", settings.stopOnLowBattery) { on ->
                appVm.updateSettings { it.copy(stopOnLowBattery = on) }
            }
            SwitchRow("رفع التسجيلات عبر Wi‑Fi فقط", settings.uploadOnWifiOnly) { on ->
                appVm.updateSettings { it.copy(uploadOnWifiOnly = on) }
            }
            SwitchRow("قفل التطبيق بالبصمة", settings.appLock) { on ->
                appVm.updateSettings { it.copy(appLock = on) }
            }
        }

        Section("الحساب") {
            Text(session.username, fontWeight = FontWeight.SemiBold)
            Text(session.serverUrl, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            OutlinedButton(
                onClick = { appVm.logout() },
                modifier = Modifier.padding(top = 10.dp),
            ) {
                Icon(Icons.AutoMirrored.Filled.Logout, contentDescription = null)
                Text("  تسجيل الخروج")
            }
        }
    }
}

@Composable
private fun Section(title: String, content: @Composable () -> Unit) {
    Card(modifier = Modifier.fillMaxWidth()) {
        Column(modifier = Modifier.fillMaxWidth().padding(14.dp)) {
            Text(title, fontWeight = FontWeight.SemiBold, modifier = Modifier.padding(bottom = 10.dp))
            content()
        }
    }
}

@Composable
private fun <T> ChipRow(options: List<Pair<T, String>>, selected: T, onSelect: (T) -> Unit) {
    Row(
        modifier = Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        options.forEach { (value, label) ->
            FilterChip(
                selected = selected == value,
                onClick = { onSelect(value) },
                label = { Text(label) },
            )
        }
    }
}

@Composable
private fun SwitchRow(label: String, checked: Boolean, onChange: (Boolean) -> Unit) {
    Row(
        modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(label, modifier = Modifier.weight(1f))
        Switch(checked = checked, onCheckedChange = onChange)
    }
}
