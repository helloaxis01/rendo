import UIKit
import WebKit

final class LaterBrowserViewController: UIViewController, WKNavigationDelegate, WKUIDelegate {
    enum Outcome {
        case extracted(text: String, url: String)
        case cancelled
    }

    private let initialURL: URL
    private let completion: (Outcome) -> Void
    private var webView: WKWebView!
    private var extractButton: UIButton!
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

        let extract = UIButton(type: .system)
        extract.setTitle("Extract Recipe", for: .normal)
        extract.titleLabel?.font = .systemFont(ofSize: 17, weight: .semibold)
        extract.backgroundColor = .label
        extract.setTitleColor(.systemBackground, for: .normal)
        extract.layer.cornerRadius = 14
        extract.addTarget(self, action: #selector(extractTapped), for: .touchUpInside)
        extract.translatesAutoresizingMaskIntoConstraints = false
        extractButton = extract

        let bar = UIView()
        bar.backgroundColor = .systemBackground
        bar.translatesAutoresizingMaskIntoConstraints = false
        bar.addSubview(close)
        bar.addSubview(extract)
        view.addSubview(bar)

        let guide = view.safeAreaLayoutGuide
        NSLayoutConstraint.activate([
            bar.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            bar.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            bar.bottomAnchor.constraint(equalTo: view.bottomAnchor),

            close.leadingAnchor.constraint(equalTo: bar.leadingAnchor, constant: 16),
            close.topAnchor.constraint(equalTo: bar.topAnchor, constant: 12),
            close.bottomAnchor.constraint(equalTo: guide.bottomAnchor, constant: -12),

            extract.leadingAnchor.constraint(equalTo: close.trailingAnchor, constant: 12),
            extract.trailingAnchor.constraint(equalTo: bar.trailingAnchor, constant: -16),
            extract.centerYAnchor.constraint(equalTo: close.centerYAnchor),
            extract.heightAnchor.constraint(equalToConstant: 48),

            webView.topAnchor.constraint(equalTo: guide.topAnchor),
            webView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            webView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            webView.bottomAnchor.constraint(equalTo: bar.topAnchor),
        ])
    }

    @objc private func closeTapped() {
        finish(.cancelled)
    }

    @objc private func extractTapped() {
        extractButton.isEnabled = false
        extractButton.setTitle("Extracting…", for: .normal)
        webView.evaluateJavaScript(Self.expandCaptionScript) { [weak self] _, _ in
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.45) {
                self?.webView.evaluateJavaScript("document.body ? document.body.innerText : ''") { result, _ in
                    let text = (result as? String ?? "")
                        .trimmingCharacters(in: .whitespacesAndNewlines)
                    let pageURL = self?.webView.url?.absoluteString ?? self?.initialURL.absoluteString ?? ""
                    DispatchQueue.main.async {
                        self?.finish(.extracted(text: String(text.prefix(40_000)), url: pageURL))
                    }
                }
            }
        }
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

    private static let expandCaptionScript = """
    (function () {
      document.querySelectorAll('div[role="button"], button, span, a').forEach(function (el) {
        var t = (el.textContent || '').trim().toLowerCase();
        if (t === 'more' || t === 'see more' || t === '… more' || t === '... more') {
          try { el.click(); } catch (e) {}
        }
      });
      return true;
    })();
    """
}
