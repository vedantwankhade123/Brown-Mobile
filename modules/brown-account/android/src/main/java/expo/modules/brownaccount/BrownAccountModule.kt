package expo.modules.brownaccount

import android.content.Context
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File

/** Final native cleanup after JS has stopped writers and closed its chat database. */
class BrownAccountModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("BrownAccount")
    AsyncFunction("purgePrivateStorage") {
      val context = appContext.reactContext ?: error("App context is unavailable. Retry deletion.")
      val prefs = File(context.applicationInfo.dataDir, "shared_prefs")
      prefs.listFiles()?.filter { it.name.endsWith(".xml") }?.forEach {
        check(context.getSharedPreferences(it.name.removeSuffix(".xml"), Context.MODE_PRIVATE).edit().clear().commit()) {
          "Could not clear private settings. Retry deletion."
        }
      }
      context.databaseList().forEach { name ->
        check(context.deleteDatabase(name) || !context.getDatabasePath(name).exists()) {
          "Could not remove a local database. Retry deletion."
        }
      }
      listOf(context.filesDir, context.cacheDir, context.codeCacheDir, context.noBackupFilesDir, prefs)
        .plus(context.getExternalFilesDirs(null).filterNotNull())
        .plus(context.externalCacheDirs.filterNotNull())
        .forEach { wipeChildren(it) }
    }
  }

  private fun wipeChildren(root: File) {
    if (!root.exists()) return
    val scope = root.canonicalPath + File.separator
    val entries = root.listFiles() ?: error("Could not read private storage. Retry deletion.")
    entries.forEach { erase(it, scope) }
  }

  private fun erase(file: File, scope: String) {
    // Do not follow a symlink outside the app-owned root.
    if (file.canonicalPath.startsWith(scope) && file.isDirectory) {
      val entries = file.listFiles() ?: error("Could not read an app folder. Retry deletion.")
      entries.forEach { erase(it, scope) }
    }
    check(file.delete() || !file.exists()) { "Could not remove a private file. Retry deletion." }
  }
}
