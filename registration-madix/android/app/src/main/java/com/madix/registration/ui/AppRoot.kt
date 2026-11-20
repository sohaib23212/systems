package com.madix.registration.ui

import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.VideoLibrary
import androidx.compose.material.icons.filled.Devices
import androidx.compose.material3.Icon
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.runtime.CompositionLocalProvider
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.navigation.NavDestination.Companion.hierarchy
import androidx.navigation.NavGraph.Companion.findStartDestination
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import com.madix.registration.R
import com.madix.registration.ui.screens.DevicesScreen
import com.madix.registration.ui.screens.HomeScreen
import com.madix.registration.ui.screens.LibraryScreen
import com.madix.registration.ui.screens.LiveScreen
import com.madix.registration.ui.screens.LoginScreen
import com.madix.registration.ui.screens.PlayerScreen
import com.madix.registration.ui.screens.SettingsScreen
import com.madix.registration.ui.theme.RegistrationMadixTheme

private data class Tab(val route: String, val labelRes: Int, val icon: androidx.compose.ui.graphics.vector.ImageVector)

private val tabs = listOf(
    Tab("home", R.string.nav_home, Icons.Filled.Home),
    Tab("library", R.string.nav_library, Icons.Filled.VideoLibrary),
    Tab("devices", R.string.nav_devices, Icons.Filled.Devices),
    Tab("settings", R.string.nav_settings, Icons.Filled.Settings),
)

@Composable
fun AppRoot(
    onStartRecording: () -> Unit,
    onStopRecording: () -> Unit,
    appVm: AppViewModel = viewModel(),
) {
    RegistrationMadixTheme {
        CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Rtl) {
            val session by appVm.session.collectAsState()
            val settings by appVm.settings.collectAsState()

            Surface(modifier = Modifier.fillMaxSize()) {
                if (!session.isLoggedIn) {
                    LoginScreen(appVm)
                } else {
                    LockGate(enabled = settings.appLock) {
                        MainScaffold(appVm, onStartRecording, onStopRecording)
                    }
                }
            }
        }
    }
}

@Composable
private fun MainScaffold(
    appVm: AppViewModel,
    onStartRecording: () -> Unit,
    onStopRecording: () -> Unit,
) {
    val navController = rememberNavController()

    val quick by com.madix.registration.MainActivity.quickRecordRequest.collectAsState()
    androidx.compose.runtime.LaunchedEffect(quick) {
        if (quick != 0L) {
            onStartRecording()
            com.madix.registration.MainActivity.quickRecordRequest.value = 0L
        }
    }

    Scaffold(
        bottomBar = {
            val backStack by navController.currentBackStackEntryAsState()
            val current = backStack?.destination
            val onTab = tabs.any { tab -> current?.hierarchy?.any { it.route == tab.route } == true }
            if (onTab) {
                NavigationBar {
                    tabs.forEach { tab ->
                        val selected = current?.hierarchy?.any { it.route == tab.route } == true
                        NavigationBarItem(
                            selected = selected,
                            onClick = {
                                navController.navigate(tab.route) {
                                    popUpTo(navController.graph.findStartDestination().id) { saveState = true }
                                    launchSingleTop = true
                                    restoreState = true
                                }
                            },
                            icon = { Icon(tab.icon, contentDescription = null) },
                            label = { Text(stringResource(tab.labelRes)) },
                        )
                    }
                }
            }
        },
    ) { padding ->
        NavHost(
            navController = navController,
            startDestination = "home",
            modifier = Modifier.padding(padding),
        ) {
            composable("home") {
                HomeScreen(appVm, onStartRecording, onStopRecording)
            }
            composable("library") {
                LibraryScreen(onOpen = { id -> navController.navigate("player/$id") })
            }
            composable("devices") {
                DevicesScreen(onWatch = { id -> navController.navigate("live/$id") })
            }
            composable("settings") {
                SettingsScreen(appVm)
            }
            composable("player/{id}") { entry ->
                PlayerScreen(
                    recordingId = entry.arguments?.getString("id").orEmpty(),
                    onBack = { navController.popBackStack() },
                )
            }
            composable("live/{deviceId}") { entry ->
                LiveScreen(
                    deviceId = entry.arguments?.getString("deviceId").orEmpty(),
                    onBack = { navController.popBackStack() },
                )
            }
        }
    }
}
