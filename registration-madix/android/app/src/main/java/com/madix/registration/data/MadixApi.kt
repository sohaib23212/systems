package com.madix.registration.data

import retrofit2.http.Body
import retrofit2.http.DELETE
import retrofit2.http.GET
import retrofit2.http.PATCH
import retrofit2.http.POST
import retrofit2.http.Path
import retrofit2.http.Query

interface MadixApi {
    @POST("api/auth/register")
    suspend fun register(@Body body: AuthRequest): AuthResponse

    @POST("api/auth/login")
    suspend fun login(@Body body: AuthRequest): AuthResponse

    @POST("api/auth/logout")
    suspend fun logout(@Body body: RefreshRequest): OkResponse

    @GET("api/auth/me")
    suspend fun me(): UserEnvelope

    @POST("api/devices/register")
    suspend fun registerDevice(@Body body: DeviceRegisterRequest): DeviceEnvelope

    @GET("api/devices")
    suspend fun devices(): DevicesEnvelope

    @PATCH("api/devices/{id}")
    suspend fun renameDevice(@Path("id") id: String, @Body body: DeviceRenameRequest): DeviceEnvelope

    @DELETE("api/devices/{id}")
    suspend fun deleteDevice(@Path("id") id: String): OkResponse

    @POST("api/devices/{id}/stop")
    suspend fun stopDevice(@Path("id") id: String): OkResponse

    @POST("api/recordings")
    suspend fun createRecording(@Body body: RecordingCreateRequest): RecordingEnvelope

    @GET("api/recordings")
    suspend fun recordings(@Query("before") before: String? = null): RecordingsEnvelope

    @GET("api/recordings/{id}")
    suspend fun recording(@Path("id") id: String): RecordingEnvelope

    @PATCH("api/recordings/{id}")
    suspend fun renameRecording(@Path("id") id: String, @Body body: RecordingRenameRequest): RecordingEnvelope

    @DELETE("api/recordings/{id}")
    suspend fun deleteRecording(@Path("id") id: String): OkResponse
}
