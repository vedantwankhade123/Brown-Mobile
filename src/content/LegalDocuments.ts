export type LegalDocumentId = 'privacy' | 'terms';
export interface LegalDocument { title: string; introduction: string; sections: { title: string; paragraphs: string[] }[]; }
export const LEGAL_REVISION = '2026-10-04';

export const LEGAL_DOCUMENTS: Record<LegalDocumentId, LegalDocument> = {
  privacy: {
    title: 'Privacy Policy',
    introduction: 'Your local profile belongs on your device. Here is what Brown stores, what optional connections share, and how to remove your data.',
    sections: [
      { title: 'Profile & Chats', paragraphs: [
        'Brown Mobile is developed by Vedant Wankhade. Your mobile profile is a local profile, separate from any account on usebrown.online. Profile details, consent records, conversations, settings and saved preferences are stored on your device.',
        'When you select a downloaded local model, prompts and responses are processed on the device. Model downloads and update checks need an internet connection. Brown does not request device location access or automatically determine your city.',
      ] },
      { title: 'Connected Services', paragraphs: [
        'When you select a cloud model or remote endpoint, that service receives your prompt and the conversation, file context and enabled saved preferences included in the request. The provider’s privacy policy and retention rules apply.',
        'Optional desktop pairing exchanges information with the device you connect, including profile settings and conversation data. Disconnect pairing when you no longer want to use it. Deleting the mobile profile does not delete copies already stored on a desktop or by a provider.',
      ] },
      { title: 'Voice and permissions', paragraphs: [
        'Microphone access is used for voice input. System speech recognition is handled by your device’s speech service and may use its own online processing. Downloaded local speech engines process audio on the device. Camera access is used when scanning a desktop pairing code.',
        'You can deny or revoke permissions in device settings. Optional features requiring those permissions will be unavailable until you grant access.',
      ] },
      { title: 'Storage & Credentials', paragraphs: [
        'Model repositories, update hosts and other services you contact receive network requests and may record your IP address. Their own policies apply. Your local chat history is not automatically part of website download statistics.',
        'API credentials use the device’s secure storage when available. Chats and exported backups are not additionally encrypted by Brown. Device storage protections apply to private app files; you are responsible for protecting files saved in shared folders.',
      ] },
      { title: 'Memory and backups', paragraphs: [
        'Brown can keep preferences you explicitly ask it to remember. View Preferences lets you edit or delete them. Turning saved memory off keeps preferences stored but excludes them from future chat requests.',
        'Backups contain conversation data and saved preferences. Exported copies remain in the folders you choose, and imported backups merge with existing data. Keep backups private and delete exported copies separately when you no longer need them.',
      ] },
      { title: 'Account Deletion', paragraphs: [
        'Settings → Account → Delete Account removes your local profile, consent records, conversations, preferences, provider credentials, pairing configuration, downloaded model data managed by Brown and private app files and caches. Brown then restarts at onboarding for a fresh local profile.',
        'This reset cannot remove copies you exported, synced to another device or sent to an external service. It also does not delete a separate website account. Contact us about information you submitted to the website.',
      ] },
      { title: 'Contact and changes', paragraphs: [
        'For privacy questions, contact Vedant Wankhade at contact@usebrown.online. The full website policy is available at usebrown.online/privacy and explains website accounts, download statistics and contact forms.',
        'We may revise this policy when features or data handling change. The revision date identifies this mobile policy.',
      ] },
    ],
  },
  terms: {
    title: 'Terms of Use',
    introduction: 'These terms explain your license to use Brown, your responsibilities, and the limits of AI-generated responses.',
    sections: [
      { title: 'Using Brown', paragraphs: [
        'By downloading, installing or using Brown AI, you agree to these terms. If you do not agree, discontinue use and uninstall the app. Brown supports local AI and optional online services on supported devices.',
        'A mobile profile is stored locally. Creating or deleting it does not create or delete a website account or an account with a cloud provider.',
      ] },
      { title: 'Ownership and license', paragraphs: [
        'Brown AI’s proprietary code, interface, branding, design assets and documentation belong to Vedant Wankhade. Rights not expressly granted are reserved.',
        'Subject to these terms, you receive a non-exclusive, non-transferable, revocable personal license to use Brown for personal and professional productivity. Do not redistribute or resell proprietary binaries or intellectual property, or reverse engineer or decompile them without written permission, except where applicable law permits it. Third-party models and libraries retain their own licenses.',
      ] },
      { title: 'Your Data', paragraphs: [
        'You retain control of your local conversations and files. See the Privacy Policy for storage, saved memory, backups and optional online processing.',
        'Delete Account permanently removes the mobile app’s local account data and returns to onboarding. Export a backup first if you want to keep your history. Exported copies and data already held by other devices or services must be managed separately.',
      ] },
      { title: 'Third-party services', paragraphs: [
        'Cloud models, remote endpoints, model repositories and services you connect are governed by their own terms, privacy policies and licenses. You are responsible for your API credentials, provider charges and compliance with those terms.',
        'Review which model and connected services are active before sending sensitive information. Supervise any actions you authorize on a paired desktop.',
      ] },
      { title: 'Acceptable use', paragraphs: [
        'Do not use Brown to violate applicable laws, infringe intellectual property or privacy rights, create or distribute malicious software, or bypass authentication, security boundaries or safety controls.',
      ] },
      { title: 'AI & Warranties', paragraphs: [
        'AI-generated responses can be incomplete, inaccurate or inappropriate. Verify important information and review generated content before relying on it.',
        'Brown is provided “as is” and “as available”, without warranties of accuracy, availability, merchantability, fitness for a particular purpose or non-infringement, to the extent permitted by law.',
      ] },
      { title: 'Liability and changes', paragraphs: [
        'To the maximum extent permitted by law, the owner and contributors are not liable for indirect, incidental, special, consequential or punitive damages, including data loss, hardware malfunction or downtime resulting from use or inability to use Brown. These terms do not exclude rights or liabilities that applicable law does not allow to be excluded.',
        'Software and terms may change. Significant updates will be reflected in the revision date and app or website release information. Continued use signifies acceptance of updated terms, where permitted by applicable law.',
      ] },
      { title: 'Contact', paragraphs: [
        'For licensing requests, questions or feedback, contact Vedant Wankhade at contact@usebrown.online. The website terms are available at usebrown.online/terms.',
      ] },
    ],
  },
};
