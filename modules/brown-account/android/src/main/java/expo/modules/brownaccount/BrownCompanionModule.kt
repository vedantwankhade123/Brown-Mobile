package expo.modules.brownaccount

import android.content.Context
import android.net.ConnectivityManager
import android.net.Network
import android.net.LinkProperties
import android.util.Base64
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.net.NetworkInterface
import java.net.Inet4Address
import java.security.MessageDigest
import java.security.SecureRandom
import javax.crypto.Cipher
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.SecretKeySpec
import org.json.JSONObject

class BrownCompanionModule : Module() {
  private var callback: ConnectivityManager.NetworkCallback? = null
  private fun manager() = appContext.reactContext?.getSystemService(Context.CONNECTIVITY_SERVICE) as? ConnectivityManager
  private fun digest(secret: String): ByteArray {
    require(Regex("^[a-f0-9]{48,64}$").matches(secret)) { "Invalid companion key" }
    return MessageDigest.getInstance("SHA-256").digest(secret.toByteArray(Charsets.UTF_8))
  }
  override fun definition() = ModuleDefinition {
    Name("BrownCompanion")
    Events("networkChanged")
    AsyncFunction("addresses") {
      NetworkInterface.getNetworkInterfaces().toList().flatMap { it.inetAddresses.toList() }
        .filter { it is Inet4Address && !it.isLoopbackAddress }.mapNotNull { it.hostAddress }
    }
    AsyncFunction("keyId") { secret: String -> digest(secret).joinToString("") { "%02x".format(it) }.take(32) }
    AsyncFunction("seal") { secret: String, keyId: String, payload: String ->
      val random = SecureRandom()
      val iv = ByteArray(12).also { random.nextBytes(it) }
      val id = ByteArray(16).also { random.nextBytes(it) }.joinToString("") { "%02x".format(it) }
      val cipher = Cipher.getInstance("AES/GCM/NoPadding")
      cipher.init(Cipher.ENCRYPT_MODE, SecretKeySpec(digest(secret), "AES"), GCMParameterSpec(128, iv))
      cipher.updateAAD("brown-v2:request:$keyId:$id".toByteArray())
      JSONObject().put("v", 2).put("keyId", keyId).put("id", id)
        .put("iv", Base64.encodeToString(iv, Base64.NO_WRAP))
        .put("data", Base64.encodeToString(cipher.doFinal(payload.toByteArray(Charsets.UTF_8)), Base64.NO_WRAP)).toString()
    }
    AsyncFunction("open") { secret: String, expectedKeyId: String, expectedId: String, envelope: String ->
      val data = JSONObject(envelope)
      require(data.getInt("v") == 2 && data.getString("keyId") == expectedKeyId && data.getString("id") == expectedId) { "Unexpected companion response" }
      val iv = Base64.decode(data.getString("iv"), Base64.NO_WRAP)
      require(iv.size == 12)
      val cipher = Cipher.getInstance("AES/GCM/NoPadding")
      cipher.init(Cipher.DECRYPT_MODE, SecretKeySpec(digest(secret), "AES"), GCMParameterSpec(128, iv))
      cipher.updateAAD("brown-v2:response:$expectedKeyId:$expectedId".toByteArray())
      String(cipher.doFinal(Base64.decode(data.getString("data"), Base64.NO_WRAP)), Charsets.UTF_8)
    }
    OnStartObserving {
      if (callback == null) {
        val listener = object : ConnectivityManager.NetworkCallback() {
          override fun onAvailable(network: Network) { sendEvent("networkChanged", emptyMap<String, Any>()) }
          override fun onLost(network: Network) { sendEvent("networkChanged", emptyMap<String, Any>()) }
          override fun onLinkPropertiesChanged(network: Network, props: LinkProperties) { sendEvent("networkChanged", emptyMap<String, Any>()) }
        }
        manager()?.registerDefaultNetworkCallback(listener)
        callback = listener
      }
    }
    OnStopObserving { callback?.let { manager()?.unregisterNetworkCallback(it) }; callback = null }
    OnDestroy { callback?.let { manager()?.unregisterNetworkCallback(it) }; callback = null }
  }
}
