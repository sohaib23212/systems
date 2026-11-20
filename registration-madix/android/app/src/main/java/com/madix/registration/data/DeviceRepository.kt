package com.madix.registration.data

import android.os.Build
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

class DeviceRepository(private val graph: AppGraph) {

    @Volatile var currentDeviceId: String = ""
        private set

    suspend fun ensureRegistered(canLive: Boolean = true): Result<Device> =
        withContext(Dispatchers.IO) {
            runCatching {
                val installId = graph.prefs.installId()
                val name = "${Build.MANUFACTURER} ${Build.MODEL}".trim()
                val env = graph.api.registerDevice(
                    DeviceRegisterRequest(
                        installId = installId,
                        name = name.ifBlank { "جهاز Android" },
                        model = Build.MODEL ?: "",
                        platform = "android",
                        osVersion = "Android ${Build.VERSION.RELEASE}",
                        canLive = canLive,
                    )
                )
                currentDeviceId = env.device.id
                env.device
            }
        }

    suspend fun list(): Result<List<Device>> = withContext(Dispatchers.IO) {
        runCatching { graph.api.devices().devices }
    }

    suspend fun rename(id: String, name: String): Result<Device> = withContext(Dispatchers.IO) {
        runCatching { graph.api.renameDevice(id, DeviceRenameRequest(name)).device }
    }

    suspend fun delete(id: String): Result<Unit> = withContext(Dispatchers.IO) {
        runCatching { graph.api.deleteDevice(id); Unit }
    }

    suspend fun stopRemote(id: String): Result<Boolean> = withContext(Dispatchers.IO) {
        runCatching { graph.api.stopDevice(id).delivered ?: false }
    }
}
