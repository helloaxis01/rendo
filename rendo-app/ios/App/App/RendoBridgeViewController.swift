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
        bridge?.registerPluginInstance(LaterBrowserPlugin())
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
        let recipes = json["recipes"]
        let images = json["images"] as? [String] ?? []
        let imageCount = json["imageCount"] as? Int ?? images.count
        if url.isEmpty && text.isEmpty && recipes == nil && images.isEmpty && imageCount == 0 { return }

        var payload: [String: Any] = [
            "url": url,
            "text": text,
            "silent": json["silent"] as? Bool ?? false,
            "later": json["later"] as? Bool ?? false,
            "notified": json["notified"] as? Bool ?? false,
        ]
        if imageCount > 0 {
            payload["imageCount"] = imageCount
        }
        if !images.isEmpty {
            payload["images"] = images
        }
        if let recipes, JSONSerialization.isValidJSONObject(recipes) {
            payload["recipes"] = recipes
        }
        guard JSONSerialization.isValidJSONObject(payload),
              let data = try? JSONSerialization.data(withJSONObject: payload),
              let encoded = String(data: data, encoding: .utf8) else { return }

        let js = """
        (function(){
          var d = \(encoded);
          function publish(attempt) {
            if (typeof window.__rendoPublishShare === "function") {
              window.__rendoPublishShare(d);
              return;
            }
            if (attempt < 24) {
              setTimeout(function(){ publish(attempt + 1); }, 250);
              return;
            }
            window.dispatchEvent(new CustomEvent("rendo:incoming-share",{detail:d}));
          }
          publish(0);
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
