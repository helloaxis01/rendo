import UIKit
import WebKit
import Capacitor

class RendoBridgeViewController: CAPBridgeViewController {
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
