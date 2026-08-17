import UIKit
import WebKit

final class LaterBrowserViewController: UIViewController, WKNavigationDelegate, WKUIDelegate {
    enum Outcome {
        case paste(text: String, url: String)
        case screenshots(url: String)
        case cancelled
    }

    private let initialURL: URL
    private let completion: (Outcome) -> Void
    private var webView: WKWebView!
    private var didComplete = false

    private static let desktopUserAgent =
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15"

    init(url: URL, completion: @escaping (Outcome) -> Void) {
        self.initialURL = url
        self.completion = completion
        super.init(nibName: nil, bundle: nil)
        modalPresentationStyle = .fullScreen
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .systemBackground
        setupWebView()
        setupChrome()
        webView.load(URLRequest(url: initialURL))
    }

    private func setupWebView() {
        let userScript = WKUserScript(
            source: Self.pagePatchScript,
            injectionTime: .atDocumentEnd,
            forMainFrameOnly: true
        )
        let controller = WKUserContentController()
        controller.addUserScript(userScript)

        let config = WKWebViewConfiguration()
        config.userContentController = controller
        config.defaultWebpagePreferences.preferredContentMode = .desktop
        config.allowsInlineMediaPlayback = true
        config.mediaTypesRequiringUserActionForPlayback = []

        let webView = WKWebView(frame: .zero, configuration: config)
        webView.customUserAgent = Self.desktopUserAgent
        webView.allowsLinkPreview = false
        webView.allowsBackForwardNavigationGestures = true
        webView.navigationDelegate = self
        webView.uiDelegate = self
        webView.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(webView)
        self.webView = webView
    }

    private func setupChrome() {
        let close = UIButton(type: .system)
        close.setTitle("Close", for: .normal)
        close.titleLabel?.font = .systemFont(ofSize: 17, weight: .semibold)
        close.addTarget(self, action: #selector(closeTapped), for: .touchUpInside)
        close.translatesAutoresizingMaskIntoConstraints = false

        let paste = Self.actionButton(
            title: "Paste Text & Parse",
            filled: true,
            action: #selector(pasteTapped),
            target: self
        )
        let shots = Self.actionButton(
            title: "Multi-Screenshot OCR",
            filled: false,
            action: #selector(screenshotsTapped),
            target: self
        )

        let stack = UIStackView(arrangedSubviews: [paste, shots])
        stack.axis = .vertical
        stack.spacing = 8
        stack.translatesAutoresizingMaskIntoConstraints = false

        let bar = UIView()
        bar.backgroundColor = .systemBackground
        bar.translatesAutoresizingMaskIntoConstraints = false
        bar.addSubview(close)
        bar.addSubview(stack)
        view.addSubview(bar)

        let hairline = UIView()
        hairline.backgroundColor = .separator
        hairline.translatesAutoresizingMaskIntoConstraints = false
        bar.addSubview(hairline)

        let guide = view.safeAreaLayoutGuide
        NSLayoutConstraint.activate([
            bar.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            bar.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            bar.bottomAnchor.constraint(equalTo: view.bottomAnchor),

            hairline.leadingAnchor.constraint(equalTo: bar.leadingAnchor),
            hairline.trailingAnchor.constraint(equalTo: bar.trailingAnchor),
            hairline.topAnchor.constraint(equalTo: bar.topAnchor),
            hairline.heightAnchor.constraint(equalToConstant: 1 / UIScreen.main.scale),

            close.leadingAnchor.constraint(equalTo: bar.leadingAnchor, constant: 16),
            close.topAnchor.constraint(equalTo: bar.topAnchor, constant: 10),

            stack.leadingAnchor.constraint(equalTo: bar.leadingAnchor, constant: 16),
            stack.trailingAnchor.constraint(equalTo: bar.trailingAnchor, constant: -16),
            stack.topAnchor.constraint(equalTo: close.bottomAnchor, constant: 8),
            stack.bottomAnchor.constraint(equalTo: guide.bottomAnchor, constant: -12),

            paste.heightAnchor.constraint(equalToConstant: 48),
            shots.heightAnchor.constraint(equalToConstant: 48),

            webView.topAnchor.constraint(equalTo: guide.topAnchor),
            webView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            webView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            webView.bottomAnchor.constraint(equalTo: bar.topAnchor),
        ])
    }

    private static func actionButton(
        title: String,
        filled: Bool,
        action: Selector,
        target: Any
    ) -> UIButton {
        let button = UIButton(type: .system)
        button.setTitle(title, for: .normal)
        button.titleLabel?.font = .systemFont(ofSize: 16, weight: .semibold)
        button.layer.cornerRadius = 14
        if filled {
            button.backgroundColor = .label
            button.setTitleColor(.systemBackground, for: .normal)
        } else {
            button.backgroundColor = .secondarySystemBackground
            button.setTitleColor(.label, for: .normal)
        }
        button.addTarget(target, action: action, for: .touchUpInside)
        button.translatesAutoresizingMaskIntoConstraints = false
        return button
    }

    @objc private func closeTapped() {
        finish(.cancelled)
    }

    @objc private func pasteTapped() {
        let text = UIPasteboard.general.string?
            .trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        finish(.paste(text: String(text.prefix(40_000)), url: currentURL()))
    }

    @objc private func screenshotsTapped() {
        finish(.screenshots(url: currentURL()))
    }

    private func currentURL() -> String {
        webView.url?.absoluteString ?? initialURL.absoluteString
    }

    private func finish(_ outcome: Outcome) {
        guard !didComplete else { return }
        didComplete = true
        dismiss(animated: true) { [completion] in
            completion(outcome)
        }
    }

    func webView(
        _ webView: WKWebView,
        decidePolicyFor navigationAction: WKNavigationAction,
        decisionHandler: @escaping (WKNavigationActionPolicy) -> Void
    ) {
        guard let url = navigationAction.request.url else {
            decisionHandler(.cancel)
            return
        }
        let scheme = url.scheme?.lowercased() ?? ""
        let host = url.host?.lowercased() ?? ""

        if host.contains("apps.apple.com") || host.contains("itunes.apple.com") {
            decisionHandler(.cancel)
            return
        }

        if scheme == "http" || scheme == "https" {
            if navigationAction.targetFrame == nil {
                webView.load(navigationAction.request)
                decisionHandler(.cancel)
                return
            }
            decisionHandler(.allow)
            return
        }

        decisionHandler(.cancel)
    }

    func webView(
        _ webView: WKWebView,
        createWebViewWith configuration: WKWebViewConfiguration,
        for navigationAction: WKNavigationAction,
        windowFeatures: WKWindowFeatures
    ) -> WKWebView? {
        if navigationAction.request.url != nil {
            webView.load(navigationAction.request)
        }
        return nil
    }

    private static let pagePatchScript = """
    (function () {
      try {
        document.querySelectorAll('meta[name="apple-itunes-app"]').forEach(function (el) {
          el.remove();
        });
        var style = document.createElement('style');
        style.textContent = [
          '[id*="app-install"],[class*="app-install"],[class*="download-app"],',
          '[id*="mobile-banner"],[class*="xPromo"],iframe[src*="apps.apple.com"]',
          '{display:none!important}'
        ].join('');
        document.documentElement.appendChild(style);
      } catch (e) {}
    })();
    """
}
