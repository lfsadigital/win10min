import ManagedSettings
import ManagedSettingsUI
import UIKit

class ShieldConfigurationExtension: ShieldConfigurationDataSource {
    
    // Roman Empire theme colors
    private let imperialPurple = UIColor(red: 0.4, green: 0.2, blue: 0.6, alpha: 1.0)
    private let romanGold = UIColor(red: 0.8, green: 0.6, blue: 0.2, alpha: 1.0)
    private let darkBackground = UIColor(red: 0.05, green: 0.05, blue: 0.1, alpha: 1.0)
    
    override func configuration(shielding application: Application) -> ShieldConfiguration {
        // Custom configuration for blocked apps
        return ShieldConfiguration(
            backgroundBlurStyle: .systemUltraThinMaterialDark,
            backgroundColor: darkBackground,
            icon: UIImage(systemName: "building.columns.fill"),
            title: ShieldConfiguration.Label(
                text: "Building Empire 🏛️",
                color: .white
            ),
            subtitle: ShieldConfiguration.Label(
                text: "Return to 10 Minutes and stay focused, Emperor",
                color: UIColor.systemGray2
            ),
            primaryButtonLabel: ShieldConfiguration.Label(
                text: "Understood",
                color: .white
            ),
            primaryButtonBackgroundColor: imperialPurple
        )
    }
    
    override func configuration(shielding application: Application, in category: ActivityCategory) -> ShieldConfiguration {
        // Same configuration for category-blocked apps
        return configuration(shielding: application)
    }
    
    override func configuration(shielding webDomain: WebDomain) -> ShieldConfiguration {
        // Configuration for blocked websites
        return ShieldConfiguration(
            backgroundBlurStyle: .systemThickMaterialDark,
            backgroundColor: UIColor(red: 0.1, green: 0.1, blue: 0.15, alpha: 1.0),
            icon: UIImage(systemName: "globe"),
            title: ShieldConfiguration.Label(
                text: "Website Blocked 🏛️",
                color: .white
            ),
            subtitle: ShieldConfiguration.Label(
                text: "This website is blocked during your focus session",
                color: .systemGray
            ),
            primaryButtonLabel: ShieldConfiguration.Label(
                text: "OK",
                color: .white
            ),
            primaryButtonBackgroundColor: UIColor(red: 0.4, green: 0.2, blue: 0.6, alpha: 1.0)
        )
    }
    
    override func configuration(shielding webDomain: WebDomain, in category: ActivityCategory) -> ShieldConfiguration {
        return configuration(shielding: webDomain)
    }
}