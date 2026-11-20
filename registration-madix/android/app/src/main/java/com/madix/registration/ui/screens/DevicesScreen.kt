package com.madix.registration.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Circle
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.DriveFileRenameOutline
import androidx.compose.material.icons.filled.LiveTv
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Smartphone
import androidx.compose.material.icons.filled.Stop
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import com.madix.registration.data.Device
import com.madix.registration.ui.DevicesViewModel

@Composable
fun DevicesScreen(
    onWatch: (String) -> Unit,
    vm: DevicesViewModel = viewModel(),
) {
    val devices by vm.devices.collectAsState()
    val loading by vm.loading.collectAsState()
    val connected by vm.connected.collectAsState()

    var renameTarget by remember { mutableStateOf<Device?>(null) }
    var deleteTarget by remember { mutableStateOf<Device?>(null) }

    Column(modifier = Modifier.fillMaxSize()) {
        Row(
            modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 12.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text("الأجهزة", style = MaterialTheme.typography.titleLarge, modifier = Modifier.weight(1f))
            Icon(
                Icons.Filled.Circle,
                contentDescription = null,
                tint = if (connected) Color(0xFF4CAF50) else MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.size(10.dp),
            )
            IconButton(onClick = { vm.refresh() }) {
                Icon(Icons.Filled.Refresh, contentDescription = "تحديث")
            }
        }

        if (devices.isEmpty()) {
            Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                Text(
                    if (loading) "جارٍ التحميل..." else "لا توجد أجهزة",
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        } else {
            LazyColumn(
                modifier = Modifier.fillMaxSize(),
                contentPadding = androidx.compose.foundation.layout.PaddingValues(16.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                items(devices, key = { it.id }) { device ->
                    DeviceRow(
                        device = device,
                        onWatch = { onWatch(device.id) },
                        onStop = { vm.stopRemote(device.id) },
                        onRename = { renameTarget = device },
                        onDelete = { deleteTarget = device },
                    )
                }
            }
        }
    }

    renameTarget?.let { target ->
        var newName by remember(target.id) { mutableStateOf(target.name) }
        AlertDialog(
            onDismissRequest = { renameTarget = null },
            confirmButton = { TextButton(onClick = { vm.rename(target.id, newName); renameTarget = null }) { Text("حفظ") } },
            dismissButton = { TextButton(onClick = { renameTarget = null }) { Text("إلغاء") } },
            title = { Text("إعادة تسمية الجهاز") },
            text = { OutlinedTextField(value = newName, onValueChange = { newName = it }, singleLine = true) },
        )
    }

    deleteTarget?.let { target ->
        AlertDialog(
            onDismissRequest = { deleteTarget = null },
            confirmButton = { TextButton(onClick = { vm.delete(target.id); deleteTarget = null }) { Text("حذف") } },
            dismissButton = { TextButton(onClick = { deleteTarget = null }) { Text("إلغاء") } },
            title = { Text("حذف الجهاز") },
            text = { Text("سيُزال هذا الجهاز من القائمة.") },
        )
    }
}

@Composable
private fun DeviceRow(
    device: Device,
    onWatch: () -> Unit,
    onStop: () -> Unit,
    onRename: () -> Unit,
    onDelete: () -> Unit,
) {
    var menu by remember { mutableStateOf(false) }
    Card(modifier = Modifier.fillMaxWidth()) {
        Column(modifier = Modifier.fillMaxWidth().padding(14.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Filled.Smartphone, contentDescription = null)
                Column(modifier = Modifier.weight(1f).padding(horizontal = 12.dp)) {
                    Text(device.name.ifBlank { "جهاز" }, fontWeight = FontWeight.SemiBold, maxLines = 1)
                    Text(
                        text = statusLine(device),
                        style = MaterialTheme.typography.bodySmall,
                        color = statusColor(device),
                    )
                }
                Box {
                    IconButton(onClick = { menu = true }) {
                        Icon(Icons.Filled.MoreVert, contentDescription = "خيارات")
                    }
                    DropdownMenu(expanded = menu, onDismissRequest = { menu = false }) {
                        DropdownMenuItem(
                            text = { Text("إعادة تسمية") },
                            leadingIcon = { Icon(Icons.Filled.DriveFileRenameOutline, null) },
                            onClick = { menu = false; onRename() },
                        )
                        DropdownMenuItem(
                            text = { Text("حذف") },
                            leadingIcon = { Icon(Icons.Filled.Delete, null) },
                            onClick = { menu = false; onDelete() },
                        )
                    }
                }
            }

            if (device.isRecording) {
                Row(
                    modifier = Modifier.fillMaxWidth().padding(top = 12.dp),
                    horizontalArrangement = Arrangement.spacedBy(10.dp),
                ) {
                    Button(onClick = onWatch, modifier = Modifier.weight(1f)) {
                        Icon(Icons.Filled.LiveTv, contentDescription = null, modifier = Modifier.size(18.dp))
                        Text("  مشاهدة مباشرة")
                    }
                    OutlinedButton(
                        onClick = onStop,
                        modifier = Modifier.weight(1f),
                        colors = ButtonDefaults.outlinedButtonColors(contentColor = MaterialTheme.colorScheme.error),
                    ) {
                        Icon(Icons.Filled.Stop, contentDescription = null, modifier = Modifier.size(18.dp))
                        Text("  إيقاف")
                    }
                }
            }
        }
    }
}

private fun statusLine(device: Device): String = when {
    device.isRecording -> "● يسجّل الآن"
    device.online -> "متصل"
    else -> "غير متصل"
}

private fun statusColor(device: Device): Color = when {
    device.isRecording -> Color(0xFFE53935)
    device.online -> Color(0xFF4CAF50)
    else -> Color(0xFF9E9E9E)
}
