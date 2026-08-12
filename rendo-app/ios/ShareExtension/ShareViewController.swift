//
//  ShareViewController.swift
//  RENDO Share Extension scaffold
//  Posts shared Safari / TikTok / Instagram URLs to the RENDO ingestion endpoint.
//

import UIKit
import Social
import UniformTypeIdentifiers

class ShareViewController: SLComposeServiceViewController {
    private var sharedURL: URL?

    override func viewDidLoad() {
        super.viewDidLoad()
        placeholder = "Save to RENDO"
        extractSharedURL()
    }

    override func isContentValid() -> Bool {
        return sharedURL != nil || !(contentText ?? "").isEmpty
    }

    override func didSelectPost() {
        let urlString = sharedURL?.absoluteString
        let note = (contentText ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        // Instagram often shares caption text + URL; keep both for extraction.
        let payload: String
        if let urlString, !note.isEmpty, !note.contains(urlString) {
            payload = "\(note)\n\(urlString)"
        } else if let urlString {
            payload = note.isEmpty ? urlString : note
        } else {
            payload = note
        }
        guard !payload.isEmpty,
              let endpoint = Bundle.main.object(forInfoDictionaryKey: "RENDOIngestURL") as? String,
              let url = URL(string: endpoint) else {
            extensionContext?.completeRequest(returningItems: [], completionHandler: nil)
            return
        }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        let isInstagram = payload.range(of: "instagram\\.com|instagr\\.am", options: .regularExpression) != nil
        let hasCaptionBesideUrl = (urlString != nil) && note.count >= 40
        let body: [String: Any?] = [
            "type": (isInstagram && hasCaptionBesideUrl) ? "text" : "url",
            "payload": payload,
            "media": NSNull()
        ]
        request.httpBody = try? JSONSerialization.data(withJSONObject: body as [String: Any])

        URLSession.shared.dataTask(with: request) { [weak self] _, _, _ in
            DispatchQueue.main.async {
                self?.extensionContext?.completeRequest(returningItems: [], completionHandler: nil)
            }
        }.resume()
    }

    override func configurationItems() -> [Any]! {
        return []
    }

    private func extractSharedURL() {
        guard let item = extensionContext?.inputItems.first as? NSExtensionItem,
              let providers = item.attachments else { return }

        for provider in providers {
            if provider.hasItemConformingToTypeIdentifier(UTType.url.identifier) {
                provider.loadItem(forTypeIdentifier: UTType.url.identifier, options: nil) { [weak self] item, _ in
                    DispatchQueue.main.async {
                        self?.sharedURL = item as? URL
                        self?.validateContent()
                    }
                }
                return
            }
            if provider.hasItemConformingToTypeIdentifier(UTType.plainText.identifier) {
                provider.loadItem(forTypeIdentifier: UTType.plainText.identifier, options: nil) { [weak self] item, _ in
                    guard let text = item as? String,
                          let match = text.range(of: #"https?://\S+"#, options: .regularExpression) else { return }
                    DispatchQueue.main.async {
                        self?.sharedURL = URL(string: String(text[match]))
                        self?.validateContent()
                    }
                }
            }
        }
    }
}
