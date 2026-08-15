import UIKit
import WebKit
import Capacitor

class RendoBridgeViewController: CAPBridgeViewController {
    private let shareUTI = "app.rendorecipes.rendo.share"

    override func viewDidLoad() {
        super.viewDidLoad()
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(appBecameActive),
            name: UIApplication.didBecomeActiveNotification,
            object: nil
        )
    }

    deinit {
        NotificationCenter.default.removeObserver(self)
    }

    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        drainIncomingSharePasteboard()
    }

    @objc private func appBecameActive() {
        drainIncomingSharePasteboard()
    }

    private func drainIncomingSharePasteboard() {
        guard let item = UIPasteboard.general.data(forPasteboardType: shareUTI),
              let json = try? JSONSerialization.jsonObject(with: item) as? [String: Any] else {
            return
        }
        UIPasteboard.general.setData(Data(), forPasteboardType: shareUTI)
        let url = json["url"] as? String ?? ""
        let text = json["text"] as? String ?? ""
        if url.isEmpty && text.isEmpty { return }

        let payload: [String: String] = ["url": url, "text": text]
        guard JSONSerialization.isValidJSONObject(payload),
              let data = try? JSONSerialization.data(withJSONObject: payload),
              let encoded = String(data: data, encoding: .utf8) else { return }

        let js = "window.dispatchEvent(new CustomEvent('rendo:incoming-share',{detail:\(encoded)}));"
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.4) { [weak self] in
            self?.webView?.evaluateJavaScript(js, completionHandler: nil)
        }
    }

    private func presentPrint(_ formatter: UIPrintFormatter, animated: Bool = true) {
        let controller = UIPrintInteractionController.shared
        controller.printFormatter = formatter
        controller.present(animated: animated, completionHandler: nil)
    }

    func webView(_ webView: WKWebView, print formatter: UIPrintFormatter) {
        presentPrint(formatter)
    }

    func webView(_ webView: WKWebView, print formatter: UIPrintFormatter, animated: Bool) {
        presentPrint(formatter, animated: animated)
    }
}
