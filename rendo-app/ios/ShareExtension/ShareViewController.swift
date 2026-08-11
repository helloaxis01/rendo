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
        let payload = sharedURL?.absoluteString ?? contentText ?? ""
        guard let endpoint = Bundle.main.object(forInfoDictionaryKey: "RENDOIngestURL") as? String,
              let url = URL(string: endpoint) else {
            extensionContext?.completeRequest(returningItems: [], completionHandler: nil)
            return
        }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        let body: [String: String] = [
            "type": "url",
            "payload": payload
        ]
        request.httpBody = try? JSONSerialization.data(withJSONObject: body)

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
