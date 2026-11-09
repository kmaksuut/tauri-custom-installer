export type SupportedLocale = 'en' | 'tr' | 'de' | 'fr' | 'es' | 'pt-BR' | 'ru' | 'zh-CN' | 'ja' | 'ko' | 'ar';
export interface InstallerTranslations {
    welcomeTitle: string;
    welcomeSubtitle: string;
    configureButton: string;
    installNowButton: string;
    upgradeNowButton: string;
    repairNowButton: string;
    installDirectory: string;
    browseButton: string;
    desktopShortcut: string;
    startMenuShortcut: string;
    launchOnStartup: string;
    installingTitle: string;
    cancelButton: string;
    completedTitle: string;
    launchAppCheckbox: string;
    finishButton: string;
    uninstallTitle: string;
    purgeUserDataLabel: string;
    uninstallButton: string;
    runningWarningTitle: string;
    closeAndContinueButton: string;
    backButton: string;
}
export declare function resolveLocale(rawLocale?: string | null): SupportedLocale;
export declare function getTranslations(locale?: string | null): InstallerTranslations;
export declare function isRtlLocale(locale?: string | null): boolean;
//# sourceMappingURL=i18n.d.ts.map