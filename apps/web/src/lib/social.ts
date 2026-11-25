import {
  SOCIAL_LABELS,
  SOCIAL_NETWORKS,
  type SocialLinks,
  type SocialNetwork,
} from '@desert-web/shared';

export { SOCIAL_NETWORKS, type SocialLinks, type SocialNetwork };

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
