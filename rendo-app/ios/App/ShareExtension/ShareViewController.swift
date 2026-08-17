import UIKit
import UniformTypeIdentifiers
import UserNotifications

final class ShareViewController: UIViewController {
    private var didFinish = false
    private let shareUTI = "app.rendorecipes.rendo.share"
    private let extractEndpoint = URL(string: "https://rendorecipes.netlify.app/api/extract")!

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = UIColor.black.withAlphaComponent(0.18)
        setupToast("Importing recipe to library...")
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
        let instagram = isInstagramRecipeURL(payload.url)

        stashOnPasteboard(
            url: payload.url,
            text: payload.text,
            silent: instagram,
            recipes: nil,
            later: false,
            notified: false
        )

        if instagram {
            notify("Importing recipe to library...")
            Task.detached { [weak self] in
                await self?.runBackgroundExtract(url: payload.url, text: payload.text)
            }
            try? await Task.sleep(nanoseconds: 850_000_000)
            extensionContext?.completeRequest(returningItems: [], completionHandler: nil)
            return
        }

        await openHostApp(deepLink(for: payload))
        try? await Task.sleep(nanoseconds: 350_000_000)
        extensionContext?.completeRequest(returningItems: [], completionHandler: nil)
    }

    private func runBackgroundExtract(url: String?, text: String?) async {
        guard let url, !url.isEmpty else { return }
        let outcome = await postExtract(url: url, text: text)
        await MainActor.run {
            self.stashOnPasteboard(
                url: url,
                text: text,
                silent: true,
                recipes: outcome.recipes,
                later: outcome.later,
                notified: true
            )
        }
        if outcome.later {
            notify("Saved to Links for Later tab. Tap anytime to extract!")
        } else if outcome.recipes != nil {
            notify("Recipe saved to your library.")
        }
    }

    private func postExtract(url: String, text: String?) async -> (recipes: Any?, later: Bool) {
        var request = URLRequest(url: extractEndpoint)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.timeoutInterval = 50

        let hasCaption = usableCaption(text)
        let type = hasCaption ? "text" : "url"
        let payload: String
        if hasCaption, let text, !text.isEmpty {
            payload = "Source URL: \(url)\n\n\(text)"
        } else {
            payload = url
        }
        let body: [String: Any] = [
            "type": type,
            "payload": payload,
            "media": NSNull(),
        ]
        request.httpBody = try? JSONSerialization.data(withJSONObject: body)

        guard let (data, response) = try? await URLSession.shared.data(for: request),
              let http = response as? HTTPURLResponse,
              let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            return (nil, true)
        }

        let recipes = obj["recipes"] as? [Any]
        let status = (obj["status"] as? String) ?? ""
        let usable =
            http.statusCode < 400
            && (recipes?.isEmpty == false)
            && !status.contains("REQUIRES")
        if usable {
            return (recipes, false)
        }
        return (nil, true)
    }

    private func notify(_ body: String) {
        let center = UNUserNotificationCenter.current()
        center.getNotificationSettings { settings in
            let allowed: Set<UNAuthorizationStatus> = [.authorized, .provisional, .ephemeral]
            guard allowed.contains(settings.authorizationStatus) else { return }
            let content = UNMutableNotificationContent()
            content.title = "RENDO"
            content.body = body
            content.sound = .default
            let trigger = UNTimeIntervalNotificationTrigger(timeInterval: 0.4, repeats: false)
            let request = UNNotificationRequest(
                identifier: "rendo.import.\(UUID().uuidString)",
                content: content,
                trigger: trigger
            )
            center.add(request, withCompletionHandler: nil)
        }
    }

    private func usableCaption(_ text: String?) -> Bool {
        guard let text else { return false }
        let stripped = text.replacingOccurrences(
            of: #"https?://\S+"#,
            with: " ",
            options: .regularExpression
        ).trimmingCharacters(in: .whitespacesAndNewlines)
        return stripped.count >= 20
    }

    private func isInstagramRecipeURL(_ value: String?) -> Bool {
        guard let value else { return false }
        let lower = value.lowercased()
        let hostOK =
            lower.contains("instagram.com") || lower.contains("instagr.am")
        let pathOK =
            lower.contains("/p/")
            || lower.contains("/reel")
            || lower.contains("/tv/")
        return hostOK && pathOK
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

    private func stashOnPasteboard(
        url: String?,
        text: String?,
        silent: Bool,
        recipes: Any?,
        later: Bool,
        notified: Bool
    ) {
        var body: [String: Any] = [
            "url": url ?? "",
            "text": text ?? "",
            "silent": silent,
            "later": later,
            "notified": notified,
        ]
        if let recipes, JSONSerialization.isValidJSONObject(recipes) {
            body["recipes"] = recipes
        }
        guard JSONSerialization.isValidJSONObject(body),
              let data = try? JSONSerialization.data(withJSONObject: body) else { return }
        UIPasteboard.general.setItems(
            [[shareUTI: data]],
            options: [
                .localOnly: true,
                .expirationDate: Date().addingTimeInterval(86_400),
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
