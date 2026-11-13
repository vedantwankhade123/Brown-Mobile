export type LegalDocumentId = 'privacy' | 'terms';
export interface LegalDocument { title: string; introduction: string; sections: { title: string; paragraphs: string[] }[]; }
export const LEGAL_REVISION = '2026-11-13';

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
    introduction: 'This page summarizes the software license and connected-service terms. The AGPL license governs the Brown AI software code.',
    sections: [
      { title: 'Using Brown', paragraphs: [
        'Brown supports local AI and optional online services on supported devices. The project-authored software code is licensed under the GNU Affero General Public License v3.0 only (AGPL-3.0-only). This page does not add restrictions to the rights granted by that license.',
        'A mobile profile is stored locally. Creating or deleting it does not create or delete a website account or an account with a cloud provider.',
      ] },
      { title: 'Ownership and license', paragraphs: [
        'Project-authored Brown AI software is licensed under the GNU Affero General Public License v3.0 only. You may use, inspect, modify, and redistribute covered code under that license. It requires corresponding source in the cases it describes, including when users interact over a network with a modified version. The full license is at github.com/vedantwankhade123/Brown/blob/main/LICENSE.',
        'Brown AI and UseBrown names, official logos, app icons, and usebrown.online are reserved brand identifiers; the AGPL grants no trademark rights. Forks should use a distinct product name and replace official branding. See github.com/vedantwankhade123/Brown/blob/main/TRADEMARK.md. Third-party dependencies and model licenses remain separate.',
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
        'You are responsible for complying with laws that apply to your use. This reminder does not add restrictions to the permissions granted by AGPL-3.0-only.',
      ] },
      { title: 'AI & Warranties', paragraphs: [
        'AI-generated responses can be incomplete, inaccurate or inappropriate. Verify important information and review generated content before relying on it.',
        'For AGPL-covered software, the warranty and liability terms in the AGPL license apply, subject to rights that cannot be excluded by applicable law. AI-generated responses can be incomplete, inaccurate or inappropriate; verify important information.',
      ] },
      { title: 'Liability and changes', paragraphs: [
        'To the maximum extent permitted by law, the owner and contributors are not liable for indirect, incidental, special, consequential or punitive damages, including data loss, hardware malfunction or downtime resulting from use or inability to use Brown. These terms do not exclude rights or liabilities that applicable law does not allow to be excluded.',
        'Software and information may change. A change to this page does not modify AGPL-3.0-only or revoke rights already granted under that license.',
      ] },
      { title: 'Contact', paragraphs: [
        'For licensing questions, contact Vedant Wankhade at contact@usebrown.online. The full license and brand policy are linked from the official Brown AI repositories.',
      ] },
    ],
  },
};
