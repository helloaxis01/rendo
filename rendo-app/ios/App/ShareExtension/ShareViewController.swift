import UIKit
import UniformTypeIdentifiers

final class ShareViewController: UIViewController {
    private var didFinish = false
    private let shareUTI = "app.rendorecipes.rendo.share"

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = UIColor.black.withAlphaComponent(0.18)
        setupToast("Opening RENDO…")
    }

    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        guard !didFinish else { return }
        didFinish = true
        Task { await finishShare() }
    }

    private func setupToast(_ text: String) {
        view.subviews.forEach { $0.removeFromSuperview() }

        let pill = UIView()
        pill.backgroundColor = UIColor.secondarySystemBackground
        pill.layer.cornerRadius = 18
        pill.layer.shadowColor = UIColor.black.cgColor
        pill.layer.shadowOpacity = 0.18
        pill.layer.shadowRadius = 16
        pill.layer.shadowOffset = CGSize(width: 0, height: 6)
        pill.translatesAutoresizingMaskIntoConstraints = false

        let label = UILabel()
        label.text = text
        label.font = .systemFont(ofSize: 16, weight: .semibold)
        label.textAlignment = .center
        label.numberOfLines = 2
        label.translatesAutoresizingMaskIntoConstraints = false
        pill.addSubview(label)
        view.addSubview(pill)

        NSLayoutConstraint.activate([
            pill.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            pill.centerYAnchor.constraint(equalTo: view.centerYAnchor),
            pill.leadingAnchor.constraint(greaterThanOrEqualTo: view.leadingAnchor, constant: 28),
            pill.trailingAnchor.constraint(lessThanOrEqualTo: view.trailingAnchor, constant: -28),

            label.leadingAnchor.constraint(equalTo: pill.leadingAnchor, constant: 22),
            label.trailingAnchor.constraint(equalTo: pill.trailingAnchor, constant: -22),
            label.topAnchor.constraint(equalTo: pill.topAnchor, constant: 16),
            label.bottomAnchor.constraint(equalTo: pill.bottomAnchor, constant: -16),
        ])
    }

    private func finishShare() async {
        let payload = await extractPayload()
        stashOnPasteboard(url: payload.url, text: payload.text)
        await openHostApp(deepLink(for: payload))
        try? await Task.sleep(nanoseconds: 350_000_000)
        extensionContext?.completeRequest(returningItems: [], completionHandler: nil)
    }

    private func extractPayload() async -> (url: String?, text: String?) {
        let items = (extensionContext?.inputItems as? [NSExtensionItem]) ?? []
        var urls: [String] = []
        var texts: [String] = []

        for item in items {
            if let attributed = item.attributedContentText?.string {
                texts.append(attributed)
            }
            if let title = item.attributedTitle?.string {
                texts.append(title)
            }
            for provider in item.attachments ?? [] {
                if let value = await loadURL(from: provider) {
                    urls.append(value)
                }
                texts.append(contentsOf: await loadAllText(from: provider))
            }
        }

        let sharedURL = urls.first { looksLikeHTTP($0) } ?? texts.compactMap(firstHTTPURL).first
        let parts = texts
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty && !isBareURL($0) }
            .sorted { $0.count > $1.count }
        var caption: String?
        for part in parts {
            guard let current = caption else {
                caption = part
                continue
            }
            if current.contains(part) { continue }
            if part.contains(current) {
                caption = part
                continue
            }
            caption = current + "\n" + part
        }

        return (sharedURL, caption)
    }

    private func loadURL(from provider: NSItemProvider) async -> String? {
        if provider.canLoadObject(ofClass: URL.self) {
            let loaded: URL? = await withCheckedContinuation { continuation in
                provider.loadObject(ofClass: URL.self) { object, _ in
                    continuation.resume(returning: object as? URL)
                }
            }
            if let loaded, looksLikeHTTP(loaded.absoluteString) {
                return loaded.absoluteString
            }
        }
        for type in [UTType.url, UTType.fileURL] where provider.hasItemConformingToTypeIdentifier(type.identifier) {
            if let value = await loadString(from: provider, type: type), looksLikeHTTP(value) {
                return value
            }
        }
        return nil
    }

    private func loadAllText(from provider: NSItemProvider) async -> [String] {
        var found: [String] = []

        if provider.canLoadObject(ofClass: NSAttributedString.self) {
            let loaded: NSAttributedString? = await withCheckedContinuation { continuation in
                provider.loadObject(ofClass: NSAttributedString.self) { object, _ in
                    continuation.resume(returning: object as? NSAttributedString)
                }
            }
            if let text = loaded?.string, !text.isEmpty {
                found.append(text)
            }
        }

        if provider.canLoadObject(ofClass: NSString.self) {
            let loaded: NSString? = await withCheckedContinuation { continuation in
                provider.loadObject(ofClass: NSString.self) { object, _ in
                    continuation.resume(returning: object as? NSString)
                }
            }
            if let text = loaded as String?, !text.isEmpty {
                found.append(text)
            }
        }

        let types: [UTType] = [
            .plainText, .text, .utf8PlainText, .html, .rtf, .data,
        ]
        for type in types where provider.hasItemConformingToTypeIdentifier(type.identifier) {
            if let value = await loadString(from: provider, type: type), !value.isEmpty {
                found.append(stripHTML(value))
            }
        }
        return found
    }

    private func loadString(from provider: NSItemProvider, type: UTType) async -> String? {
        await withCheckedContinuation { continuation in
            provider.loadItem(forTypeIdentifier: type.identifier, options: nil) { item, _ in
                continuation.resume(returning: Self.string(from: item))
            }
        }
    }

    private static func string(from item: NSSecureCoding?) -> String? {
        if let url = item as? URL { return url.absoluteString }
        if let url = item as? NSURL { return url.absoluteString }
        if let text = item as? String, !text.isEmpty { return text }
        if let text = item as? NSString, text.length > 0 { return text as String }
        if let attr = item as? NSAttributedString, !attr.string.isEmpty { return attr.string }
        if let data = item as? Data {
            if let text = String(data: data, encoding: .utf8), !text.isEmpty { return text }
            if let plist = try? PropertyListSerialization.propertyList(from: data, options: [], format: nil) {
                return stringifyPlist(plist)
            }
        }
        if let dict = item as? [String: Any] { return stringifyPlist(dict) }
        if let arr = item as? [Any] { return stringifyPlist(arr) }
        return nil
    }

    private static func stringifyPlist(_ value: Any) -> String? {
        if let text = value as? String, !text.isEmpty { return text }
        if JSONSerialization.isValidJSONObject(value),
           let data = try? JSONSerialization.data(withJSONObject: value),
           let text = String(data: data, encoding: .utf8) {
            return text
        }
        return String(describing: value)
    }

    private func stripHTML(_ value: String) -> String {
        value.replacingOccurrences(of: #"<[^>]+>"#, with: " ", options: .regularExpression)
            .replacingOccurrences(of: #"\s+"#, with: " ", options: .regularExpression)
            .trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private func looksLikeHTTP(_ value: String) -> Bool {
        let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        return trimmed.hasPrefix("http://") || trimmed.hasPrefix("https://")
    }

    private func isBareURL(_ value: String) -> Bool {
        let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
        guard let found = firstHTTPURL(in: trimmed) else { return false }
        return found == trimmed
    }

    private func firstHTTPURL(in text: String) -> String? {
        guard let match = text.range(of: #"https?://\S+"#, options: .regularExpression) else {
            return nil
        }
        return String(text[match]).trimmingCharacters(in: CharacterSet(charactersIn: "),.[]>\"'"))
    }

    private func stashOnPasteboard(url: String?, text: String?) {
        let body: [String: String] = [
            "url": url ?? "",
            "text": text ?? "",
        ]
        guard JSONSerialization.isValidJSONObject(body),
              let data = try? JSONSerialization.data(withJSONObject: body) else { return }
        UIPasteboard.general.setItems(
            [[shareUTI: data]],
            options: [
                .localOnly: true,
                .expirationDate: Date().addingTimeInterval(180),
            ]
        )
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
            items.append(URLQueryItem(name: "text", value: String(text.prefix(2500))))
        }
        components.queryItems = items.isEmpty ? nil : items
        return components.url ?? URL(string: "rendo://capture")!
    }

    private func openHostApp(_ url: URL) async {
        await withCheckedContinuation { (continuation: CheckedContinuation<Void, Never>) in
            var resumed = false
            let finish = {
                if resumed { return }
                resumed = true
                continuation.resume()
            }

            if let app = Self.sharedApplication() {
                app.open(url, options: [:]) { _ in finish() }
                return
            }

            var responder: UIResponder? = self
            while let current = responder {
                if let application = current as? UIApplication {
                    application.open(url, options: [:]) { _ in finish() }
                    return
                }
                responder = current.next
            }

            finish()
        }
    }

    private static func sharedApplication() -> UIApplication? {
        let selector = NSSelectorFromString("sharedApplication")
        guard UIApplication.responds(to: selector) else { return nil }
        return UIApplication.perform(selector)?.takeUnretainedValue() as? UIApplication
    }
}
