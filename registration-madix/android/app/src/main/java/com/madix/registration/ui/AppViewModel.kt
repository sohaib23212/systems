package com.madix.registration.ui

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.madix.registration.App
import com.madix.registration.data.RecordSettings
import com.madix.registration.data.Session
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

class AppViewModel : ViewModel() {

    private val graph = App.graph

    val session: StateFlow<Session> = graph.session
    val settings: StateFlow<RecordSettings> = graph.prefs.settingsFlow
        .stateIn(viewModelScope, SharingStarted.Eagerly, RecordSettings())

    suspend fun login(server: String, username: String, password: String): Result<Unit> =
        graph.authRepo.login(server, username, password)

    suspend fun register(server: String, username: String, password: String): Result<Unit> =
        graph.authRepo.register(server, username, password)

    fun logout() {
        viewModelScope.launch { graph.authRepo.logout() }
    }

    fun updateSettings(transform: (RecordSettings) -> RecordSettings) {
        viewModelScope.launch { graph.prefs.updateSettings(transform) }
    }
}
