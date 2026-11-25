/** Socialiniai tinklai, kurių ikonas moka rodyti poraštė (ši tvarka = rodymo tvarka). */
export const SOCIAL_NETWORKS = ['facebook', 'instagram', 'tiktok'] as const;

export type SocialNetwork = (typeof SOCIAL_NETWORKS)[number];

/** Kiekvieno tinklo profilio URL; tuščia eilutė tą ikoną paslepia. */
export type SocialLinks = Record<SocialNetwork, string>;

export const SOCIAL_LABELS: Record<SocialNetwork, string> = {
  facebook: 'Facebook',
  instagram: 'Instagram',
  tiktok: 'TikTok',
};

export interface VisibleSocialLink {
  network: SocialNetwork;
  label: string;
  href: string;
}

/** Tik užpildytos nuorodos (be tarpų kraštuose), SOCIAL_NETWORKS tvarka. Visos tuščios → []. */
export function visibleSocialLinks(links: SocialLinks): VisibleSocialLink[] {
  return SOCIAL_NETWORKS.flatMap((network) => {
    const href = links[network].trim();
    return href ? [{ network, label: SOCIAL_LABELS[network], href }] : [];
  });
}
