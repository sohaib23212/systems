package com.madix.registration.ui

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.madix.registration.App
import com.madix.registration.data.Recording
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

data class LibraryState(
    val loading: Boolean = false,
    val recordings: List<Recording> = emptyList(),
    val error: String? = null,
)

class LibraryViewModel : ViewModel() {

    private val repo = App.graph.recordingRepo

    private val _state = MutableStateFlow(LibraryState())
    val state: StateFlow<LibraryState> = _state.asStateFlow()

    fun refresh() {
        _state.value = _state.value.copy(loading = true, error = null)
        viewModelScope.launch {
            repo.list().fold(
                onSuccess = { list -> _state.value = LibraryState(loading = false, recordings = list) },
                onFailure = { e -> _state.value = _state.value.copy(loading = false, error = e.message) },
            )
        }
    }

    fun delete(id: String) {
        viewModelScope.launch {
            repo.delete(id).onSuccess {
                _state.value = _state.value.copy(recordings = _state.value.recordings.filterNot { it.id == id })
            }
        }
    }

    fun rename(id: String, title: String) {
        viewModelScope.launch {
            repo.rename(id, title).onSuccess { updated ->
                _state.value = _state.value.copy(
                    recordings = _state.value.recordings.map { if (it.id == id) updated else it }
                )
            }
        }
    }

    fun videoUrl(id: String) = repo.videoUrl(id)
    fun thumbnailUrl(id: String) = repo.thumbnailUrl(id)
    fun authHeader() = repo.authHeader()
}
