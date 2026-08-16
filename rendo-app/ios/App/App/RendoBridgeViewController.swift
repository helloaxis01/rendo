import UIKit
import WebKit
import Capacitor

private final class RendoPrintHandler: NSObject, WKScriptMessageHandler {
    weak var host: RendoBridgeViewController?

    func userContentController(
        _ userContentController: WKUserContentController,
        didReceive message: WKScriptMessage
    ) {
        guard message.name == "rendoPrint" else { return }
        host?.presentWebPrint()
    }
}

class RendoBridgeViewController: CAPBridgeViewController {
    private let shareUTI = "app.rendorecipes.rendo.share"
    private let printHandler = RendoPrintHandler()

    override func capacitorDidLoad() {
        super.capacitorDidLoad()
        printHandler.host = self
        webView?.configuration.userContentController.add(printHandler, name: "rendoPrint")
    }

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

        let js = """
        (function(){
          var d = \(encoded);
          if (typeof window.__rendoPublishShare === "function") {
            window.__rendoPublishShare(d);
          } else {
            window.dispatchEvent(new CustomEvent("rendo:incoming-share",{detail:d}));
          }
        })();
        """
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.4) { [weak self] in
            self?.webView?.evaluateJavaScript(js, completionHandler: nil)
        }
    }

    func presentWebPrint() {
        guard let formatter = webView?.viewPrintFormatter() else { return }
        presentPrint(formatter)
    }

    private func presentPrint(_ formatter: UIPrintFormatter, animated: Bool = true) {
        DispatchQueue.main.async {
            let controller = UIPrintInteractionController.shared
            controller.printFormatter = formatter
            controller.present(animated: animated, completionHandler: nil)
        }
    }
}
