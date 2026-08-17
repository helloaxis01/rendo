import UIKit
import UniformTypeIdentifiers

final class ShareViewController: UIViewController {
    private var didFinish = false
    private let shareUTI = "app.rendorecipes.rendo.share"
    private struct SharePayload {
        var url: String?
        var text: String?
        var images: [String]
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = UIColor.black.withAlphaComponent(0.18)
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
        stashOnPasteboard(payload)

        let photoCount = payload.images.count
        await MainActor.run {
            if photoCount > 0 && payload.url == nil {
                setupToast(photoCount == 1 ? "Photo added to session" : "Photos added to session")
            } else if photoCount == 0, let url = payload.url, isSocialPostURL(url) {
                setupToast("Screenshot the post in Rendo")
            } else {
                setupToast("Opening RENDO…")
            }
        }
        await openHostApp(deepLink(for: payload))
        try? await Task.sleep(nanoseconds: photoCount > 0 ? 450_000_000 : 250_000_000)
        extensionContext?.completeRequest(returningItems: [], completionHandler: nil)
    }

    private func extractPayload() async -> SharePayload {
        let items = (extensionContext?.inputItems as? [NSExtensionItem]) ?? []
        var urls: [String] = []
        var texts: [String] = []
        var images: [String] = []

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
                if images.count < 4, isPhotoAttachment(provider), let jpeg = await loadJPEG(from: provider) {
                    images.append(jpeg)
                }
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

        return SharePayload(url: sharedURL, text: caption, images: images)
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

    /// Photos-app / screenshot attachments only. Skip URL providers and tiny
    /// Instagram/Safari preview thumbnails so post shares stay URL shares.
    private func isPhotoAttachment(_ provider: NSItemProvider) -> Bool {
        if provider.hasItemConformingToTypeIdentifier(UTType.url.identifier)
            || provider.canLoadObject(ofClass: URL.self) {
            return false
        }
        let imageTypes: [UTType] = [.image, .jpeg, .png, .heic]
        return provider.canLoadObject(ofClass: UIImage.self)
            || imageTypes.contains { provider.hasItemConformingToTypeIdentifier($0.identifier) }
    }

    private func loadJPEG(from provider: NSItemProvider) async -> String? {
        let imageTypes: [UTType] = [.image, .jpeg, .png, .heic]
        let canLoadImage =
            provider.canLoadObject(ofClass: UIImage.self) ||
            imageTypes.contains { provider.hasItemConformingToTypeIdentifier($0.identifier) }
        guard canLoadImage else { return nil }

        if provider.canLoadObject(ofClass: UIImage.self) {
            let loaded: UIImage? = await withCheckedContinuation { continuation in
                provider.loadObject(ofClass: UIImage.self) { object, _ in
                    continuation.resume(returning: object as? UIImage)
                }
            }
            if let loaded, isFullRecipePhoto(loaded), let jpeg = jpegBase64(loaded) {
                return jpeg
            }
        }

        for type in imageTypes where provider.hasItemConformingToTypeIdentifier(type.identifier) {
            let item: NSSecureCoding? = await withCheckedContinuation { continuation in
                provider.loadItem(forTypeIdentifier: type.identifier, options: nil) { object, _ in
                    continuation.resume(returning: object)
                }
            }
            if let image = image(from: item), isFullRecipePhoto(image), let jpeg = jpegBase64(image) {
                return jpeg
            }
        }
        return nil
    }

    private func image(from item: NSSecureCoding?) -> UIImage? {
        if let image = item as? UIImage { return image }
        if let url = item as? URL, let data = try? Data(contentsOf: url) {
            return UIImage(data: data)
        }
        if let data = item as? Data { return UIImage(data: data) }
        return nil
    }

    private func isFullRecipePhoto(_ image: UIImage) -> Bool {
        max(image.size.width, image.size.height) >= 700
    }

    private func jpegBase64(_ image: UIImage) -> String? {
        let maxEdge: CGFloat = 1280
        let longest = max(image.size.width, image.size.height)
        let scale = longest > maxEdge ? maxEdge / longest : 1
        let size = CGSize(
            width: max(1, image.size.width * scale),
            height: max(1, image.size.height * scale)
        )
        let renderer = UIGraphicsImageRenderer(size: size)
        let scaled = renderer.image { _ in
            image.draw(in: CGRect(origin: .zero, size: size))
        }
        let quality: CGFloat = 0.72
        guard var data = scaled.jpegData(compressionQuality: quality) else { return nil }
        if data.count > 900_000, let tighter = scaled.jpegData(compressionQuality: 0.52) {
            data = tighter
        }
        return data.base64EncodedString()
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

    private func isSocialPostURL(_ value: String) -> Bool {
        let lower = value.lowercased()
        return lower.contains("instagram.com")
            || lower.contains("instagr.am")
            || lower.contains("tiktok.com")
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

    private func stashOnPasteboard(_ payload: SharePayload) {
        let existing = readExistingShare()
        let previous = existing["images"] as? [String] ?? []
        let images = Array((previous + payload.images).prefix(4))
        let url = payload.url ?? (existing["url"] as? String) ?? ""
        let text = payload.text ?? (existing["text"] as? String) ?? ""
        var body: [String: Any] = [
            "url": url,
            "text": text,
        ]
        if !images.isEmpty {
            body["images"] = images
            body["imageCount"] = images.count
        }
        guard JSONSerialization.isValidJSONObject(body),
              let data = try? JSONSerialization.data(withJSONObject: body) else { return }
        UIPasteboard.general.setItems(
            [[shareUTI: data]],
            options: [
                .localOnly: true,
                .expirationDate: Date().addingTimeInterval(30 * 60),
            ]
        )
    }

    private func readExistingShare() -> [String: Any] {
        guard let item = UIPasteboard.general.data(forPasteboardType: shareUTI),
              let json = try? JSONSerialization.jsonObject(with: item) as? [String: Any] else {
            return [:]
        }
        return json
    }

    private func deepLink(for payload: SharePayload) -> URL {
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
        if !payload.images.isEmpty {
            items.append(URLQueryItem(name: "images", value: String(payload.images.count)))
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
