import UIKit
import UniformTypeIdentifiers

final class ShareViewController: UIViewController {
    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .clear
        Task { await finishShare() }
    }

    private func finishShare() async {
        let payload = await extractPayload()
        if let url = deepLink(for: payload) {
            openHostApp(url)
        }
        extensionContext?.completeRequest(returningItems: [], completionHandler: nil)
    }

    private func extractPayload() async -> (url: String?, text: String?) {
        guard
            let item = extensionContext?.inputItems.first as? NSExtensionItem,
            let providers = item.attachments
        else {
            return (nil, nil)
        }

        var sharedURL: String?
        var sharedText: String?

        for provider in providers {
            if sharedURL == nil, provider.hasItemConformingToTypeIdentifier(UTType.url.identifier) {
                sharedURL = await loadString(from: provider, type: UTType.url)
            }
            if sharedText == nil, provider.hasItemConformingToTypeIdentifier(UTType.plainText.identifier) {
                sharedText = await loadString(from: provider, type: UTType.plainText)
            }
            if sharedURL == nil, provider.hasItemConformingToTypeIdentifier(UTType.fileURL.identifier) {
                sharedURL = await loadString(from: provider, type: UTType.fileURL)
            }
        }

        if sharedURL == nil, let sharedText {
            sharedURL = firstHTTPURL(in: sharedText)
        }

        return (sharedURL, sharedText)
    }

    private func loadString(from provider: NSItemProvider, type: UTType) async -> String? {
        await withCheckedContinuation { continuation in
            provider.loadItem(forTypeIdentifier: type.identifier, options: nil) { item, _ in
                if let url = item as? URL {
                    continuation.resume(returning: url.absoluteString)
                } else if let text = item as? String {
                    continuation.resume(returning: text)
                } else if let data = item as? Data, let text = String(data: data, encoding: .utf8) {
                    continuation.resume(returning: text)
                } else {
                    continuation.resume(returning: nil)
                }
            }
        }
    }

    private func firstHTTPURL(in text: String) -> String? {
        guard let match = text.range(of: #"https?://\S+"#, options: .regularExpression) else {
            return nil
        }
        return String(text[match]).trimmingCharacters(in: CharacterSet(charactersIn: "),.[]>\"'"))
    }

    private func deepLink(for payload: (url: String?, text: String?)) -> URL? {
        var parts: [String] = []
        if let url = payload.url?.trimmingCharacters(in: .whitespacesAndNewlines), !url.isEmpty,
           let encoded = url.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) {
            parts.append("url=\(encoded)")
        }
        if let text = payload.text?.trimmingCharacters(in: .whitespacesAndNewlines), !text.isEmpty {
            let clipped = String(text.prefix(4000))
            if let encoded = clipped.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) {
                parts.append("text=\(encoded)")
            }
        }
        guard !parts.isEmpty else { return nil }
        return URL(string: "rendo://capture?\(parts.joined(separator: "&"))")
    }

    private func openHostApp(_ url: URL) {
        var responder: UIResponder? = self
        let selector = sel_registerName("openURL:")
        while let current = responder {
            if current.responds(to: selector) {
                _ = current.perform(selector, with: url)
                return
            }
            responder = current.next
        }
    }
}
