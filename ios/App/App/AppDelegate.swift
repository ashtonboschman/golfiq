import UIKit
import Capacitor
import WebKit

@objc(GolfIQBridgeViewController)
final class GolfIQBridgeViewController: CAPBridgeViewController {
    private let startupOverlay = UIView()
    private let loaderContainer = UIView()
    private let loaderTrack = CAShapeLayer()
    private let loaderArc = CAShapeLayer()
    private var progressObservation: NSKeyValueObservation?

    override func capacitorDidLoad() {
        super.capacitorDidLoad()
        installStartupLoader()
        observeInitialPageLoad()
    }

    private func installStartupLoader() {
        let backgroundColor = UIColor(
            red: 15.0 / 255.0,
            green: 19.0 / 255.0,
            blue: 26.0 / 255.0,
            alpha: 1
        )
        let accentColor = UIColor(
            red: 45.0 / 255.0,
            green: 108.0 / 255.0,
            blue: 1,
            alpha: 1
        )

        startupOverlay.translatesAutoresizingMaskIntoConstraints = false
        startupOverlay.backgroundColor = backgroundColor
        startupOverlay.isAccessibilityElement = true
        startupOverlay.accessibilityLabel = "Loading"
        startupOverlay.accessibilityViewIsModal = true

        loaderContainer.translatesAutoresizingMaskIntoConstraints = false
        startupOverlay.addSubview(loaderContainer)
        view.addSubview(startupOverlay)

        NSLayoutConstraint.activate([
            startupOverlay.topAnchor.constraint(equalTo: view.topAnchor),
            startupOverlay.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            startupOverlay.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            startupOverlay.bottomAnchor.constraint(equalTo: view.bottomAnchor),
            loaderContainer.centerXAnchor.constraint(equalTo: startupOverlay.centerXAnchor),
            loaderContainer.centerYAnchor.constraint(equalTo: startupOverlay.centerYAnchor),
            loaderContainer.widthAnchor.constraint(equalToConstant: 120),
            loaderContainer.heightAnchor.constraint(equalToConstant: 120),
        ])

        let ringPath = UIBezierPath(ovalIn: CGRect(x: 1.5, y: 1.5, width: 117, height: 117)).cgPath
        loaderTrack.frame = CGRect(x: 0, y: 0, width: 120, height: 120)
        loaderTrack.path = ringPath
        loaderTrack.fillColor = UIColor.clear.cgColor
        loaderTrack.strokeColor = UIColor(
            red: 42.0 / 255.0,
            green: 49.0 / 255.0,
            blue: 61.0 / 255.0,
            alpha: 0.6
        ).cgColor
        loaderTrack.lineWidth = 3

        loaderArc.frame = loaderTrack.frame
        loaderArc.path = ringPath
        loaderArc.fillColor = UIColor.clear.cgColor
        loaderArc.strokeColor = accentColor.cgColor
        loaderArc.lineWidth = 3
        loaderArc.lineCap = .round
        loaderArc.strokeStart = 0
        loaderArc.strokeEnd = 0.24

        loaderContainer.layer.addSublayer(loaderTrack)
        loaderContainer.layer.addSublayer(loaderArc)

        if let appIcon = UIImage(named: "AppIcon") {
            let logoView = UIImageView(image: appIcon)
            logoView.translatesAutoresizingMaskIntoConstraints = false
            logoView.contentMode = .scaleAspectFit
            logoView.layer.cornerRadius = 10
            logoView.clipsToBounds = true
            loaderContainer.addSubview(logoView)
            NSLayoutConstraint.activate([
                logoView.centerXAnchor.constraint(equalTo: loaderContainer.centerXAnchor),
                logoView.centerYAnchor.constraint(equalTo: loaderContainer.centerYAnchor),
                logoView.widthAnchor.constraint(equalToConstant: 70),
                logoView.heightAnchor.constraint(equalToConstant: 70),
            ])
        }

        let rotation = CABasicAnimation(keyPath: "transform.rotation.z")
        rotation.fromValue = 0
        rotation.toValue = Double.pi * 2
        rotation.duration = 1
        rotation.repeatCount = .infinity
        rotation.isRemovedOnCompletion = false
        loaderArc.add(rotation, forKey: "golfiq-startup-spin")
    }

    private func observeInitialPageLoad() {
        progressObservation = webView?.observe(\.estimatedProgress, options: [.new]) { [weak self] webView, _ in
            guard webView.estimatedProgress >= 1 else { return }
            DispatchQueue.main.async {
                self?.finishStartupLoader()
            }
        }
    }

    private func finishStartupLoader() {
        guard startupOverlay.superview != nil else { return }
        progressObservation?.invalidate()
        progressObservation = nil
        UIView.animate(withDuration: 0.15, animations: {
            self.startupOverlay.alpha = 0
        }, completion: { _ in
            self.loaderArc.removeAllAnimations()
            self.startupOverlay.removeFromSuperview()
        })
    }

    deinit {
        progressObservation?.invalidate()
    }
}

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        // Override point for customization after application launch.
        return true
    }

    func applicationWillResignActive(_ application: UIApplication) {
        // Sent when the application is about to move from active to inactive state. This can occur for certain types of temporary interruptions (such as an incoming phone call or SMS message) or when the user quits the application and it begins the transition to the background state.
        // Use this method to pause ongoing tasks, disable timers, and invalidate graphics rendering callbacks. Games should use this method to pause the game.
    }

    func applicationDidEnterBackground(_ application: UIApplication) {
        // Use this method to release shared resources, save user data, invalidate timers, and store enough application state information to restore your application to its current state in case it is terminated later.
        // If your application supports background execution, this method is called instead of applicationWillTerminate: when the user quits.
    }

    func applicationWillEnterForeground(_ application: UIApplication) {
        // Called as part of the transition from the background to the active state; here you can undo many of the changes made on entering the background.
    }

    func applicationDidBecomeActive(_ application: UIApplication) {
        // Restart any tasks that were paused (or not yet started) while the application was inactive. If the application was previously in the background, optionally refresh the user interface.
    }

    func applicationWillTerminate(_ application: UIApplication) {
        // Called when the application is about to terminate. Save data if appropriate. See also applicationDidEnterBackground:.
    }

    func application(_ app: UIApplication, open url: URL, options: [UIApplication.OpenURLOptionsKey: Any] = [:]) -> Bool {
        // Called when the app was launched with a url. Feel free to add additional processing here,
        // but if you want the App API to support tracking app url opens, make sure to keep this call
        return ApplicationDelegateProxy.shared.application(app, open: url, options: options)
    }

    func application(_ application: UIApplication, continue userActivity: NSUserActivity, restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void) -> Bool {
        // Called when the app was launched with an activity, including Universal Links.
        // Feel free to add additional processing here, but if you want the App API to support
        // tracking app url opens, make sure to keep this call
        return ApplicationDelegateProxy.shared.application(application, continue: userActivity, restorationHandler: restorationHandler)
    }

}
