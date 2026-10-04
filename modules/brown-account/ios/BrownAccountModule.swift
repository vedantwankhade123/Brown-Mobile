import ExpoModulesCore
import Foundation
import Security

public class BrownAccountModule: Module {
  public func definition() -> ModuleDefinition {
    Name("BrownAccount")
    AsyncFunction("purgePrivateStorage") {
      let status = SecItemDelete([kSecClass as String: kSecClassGenericPassword] as CFDictionary)
      guard status == errSecSuccess || status == errSecItemNotFound else {
        throw NSError(domain: "BrownAccount", code: Int(status), userInfo: [NSLocalizedDescriptionKey: "Could not remove stored credentials. Retry deletion."])
      }
      if let bundle = Bundle.main.bundleIdentifier { UserDefaults.standard.removePersistentDomain(forName: bundle) }
      URLCache.shared.removeAllCachedResponses()
      HTTPCookieStorage.shared.cookies?.forEach { HTTPCookieStorage.shared.deleteCookie($0) }
      let manager = FileManager.default
      for directory in [FileManager.SearchPathDirectory.documentDirectory, .cachesDirectory, .applicationSupportDirectory] {
        guard let root = manager.urls(for: directory, in: .userDomainMask).first else { continue }
        guard manager.fileExists(atPath: root.path) else { continue }
        for file in try manager.contentsOfDirectory(at: root, includingPropertiesForKeys: nil) {
          try manager.removeItem(at: file)
        }
      }
    }
  }
}
