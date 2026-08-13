import UIKit
import UniformTypeIdentifiers

final class ShareViewController: UIViewController {
    private var didFinish = false

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = UIColor.systemBackground.withAlphaComponent(0.94)

        let label = UILabel()
        label.text = "Opening RENDO…"
        label.font = .systemFont(ofSize: 17, weight: .semibold)
        label.textAlignment = .center
        label.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(label)
        NSLayoutConstraint.activate([
            label.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            label.centerYAnchor.constraint(equalTo: view.centerYAnchor),
        ])
    }

    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        guard !didFinish else { return }
        didFinish = true
        Task { await finishShare() }
    }

    private func finishShare() async {
        let payload = await extractPayload()
        let url = deepLink(for: payload)
        await MainActor.run {
            _ = openURL(url)
        }
        try? await Task.sleep(nanoseconds: 450_000_000)
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
            if sharedURL == nil {
                sharedURL = await loadURL(from: provider)
            }
            if sharedText == nil {
                sharedText = await loadText(from: provider)
            }
        }

        if sharedURL == nil, let sharedText {
            sharedURL = firstHTTPURL(in: sharedText)
        }

        return (sharedURL, sharedText)
    }

    private func loadURL(from provider: NSItemProvider) async -> String? {
        let types = [UTType.url, UTType.fileURL]
        for type in types where provider.hasItemConformingToTypeIdentifier(type.identifier) {
            if let value = await loadString(from: provider, type: type), looksLikeURL(value) {
                return value
            }
        }
        return nil
    }

    private func loadText(from provider: NSItemProvider) async -> String? {
        let types = [UTType.plainText, UTType.text, UTType.utf8PlainText]
        for type in types where provider.hasItemConformingToTypeIdentifier(type.identifier) {
            if let value = await loadString(from: provider, type: type), !value.isEmpty {
                return value
            }
        }
        return nil
    }

    private func loadString(from provider: NSItemProvider, type: UTType) async -> String? {
        await withCheckedContinuation { continuation in
            provider.loadItem(forTypeIdentifier: type.identifier, options: nil) { item, _ in
                continuation.resume(returning: Self.string(from: item))
            }
        }
    }

    private static func string(from item: NSSecureCoding?) -> String? {
        if let url = item as? URL {
            return url.absoluteString
        }
        if let url = item as? NSURL {
            return url.absoluteString
        }
        if let text = item as? String, !text.isEmpty {
            return text
        }
        if let text = item as? NSString, text.length > 0 {
            return text as String
        }
        if let data = item as? Data, let text = String(data: data, encoding: .utf8), !text.isEmpty {
            return text
        }
        return nil
    }

    private func looksLikeURL(_ value: String) -> Bool {
        let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.hasPrefix("http://")
            || trimmed.hasPrefix("https://")
            || trimmed.hasPrefix("file://")
    }

    private func firstHTTPURL(in text: String) -> String? {
        guard let match = text.range(of: #"https?://\S+"#, options: .regularExpression) else {
            return nil
        }
        return String(text[match]).trimmingCharacters(in: CharacterSet(charactersIn: "),.[]>\"'"))
    }

    private func deepLink(for payload: (url: String?, text: String?)) -> URL {
        var components = URLComponents()
        components.scheme = "rendo"
        components.host = "capture"
        var items: [URLQueryItem] = []
        if let url = payload.url?.trimmingCharacters(in: .whitespacesAndNewlines), !url.isEmpty {
            items.append(URLQueryItem(name: "url", value: url))
        }
        if let text = payload.text?.trimmingCharacters(in: .whitespacesAndNewlines), !text.isEmpty {
            items.append(URLQueryItem(name: "text", value: String(text.prefix(1500))))
        }
        components.queryItems = items.isEmpty ? nil : items
        return components.url ?? URL(string: "rendo://capture")!
    }

    /// iOS 18 rejects the deprecated `openURL:` selector from extensions.
    /// Walk the responder chain and call the current `open` API instead.
    @discardableResult
    @objc private func openURL(_ url: URL) -> Bool {
        var responder: UIResponder? = self
        while let current = responder {
            if let application = current as? UIApplication {
                application.open(url, options: [:], completionHandler: nil)
                return true
            }
            responder = current.next
        }
        return false
    }
}
