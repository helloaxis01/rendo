import Foundation
import Capacitor

@objc(LaterBrowserPlugin)
public class LaterBrowserPlugin: CAPInstancePlugin, CAPBridgedPlugin {
    public let identifier = "LaterBrowserPlugin"
    public let jsName = "LaterBrowser"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "open", returnType: CAPPluginReturnPromise)
    ]

    @objc func open(_ call: CAPPluginCall) {
        guard let urlString = call.getString("url")?.trimmingCharacters(in: .whitespacesAndNewlines),
              let url = URL(string: urlString) else {
            call.reject("Must provide a valid URL")
            return
        }

        DispatchQueue.main.async { [weak self] in
            let browser = LaterBrowserViewController(url: url) { outcome in
                switch outcome {
                case .extracted(let text, let pageURL):
                    call.resolve([
                        "cancelled": false,
                        "text": text,
                        "url": pageURL
                    ])
                case .cancelled:
                    call.resolve([
                        "cancelled": true,
                        "text": "",
                        "url": urlString
                    ])
                }
            }
            guard let host = self?.bridge?.viewController else {
                call.reject("No view controller")
                return
            }
            host.present(browser, animated: true)
        }
    }
}
