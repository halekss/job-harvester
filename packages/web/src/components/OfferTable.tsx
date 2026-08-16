import type { OfferSummary } from "../api/client.js";
import { EventButtons } from "./EventButtons.js";

export function OfferTable({ offers }: { offers: OfferSummary[] }) {
  return (
    <table className="w-full text-sm border-collapse">
      <thead>
        <tr className="text-left text-[var(--color-text-muted)] border-b border-[var(--color-border)]">
          <th className="py-2 pr-4">Titre</th>
          <th className="py-2 pr-4">Entreprise</th>
          <th className="py-2 pr-4">Ville</th>
          <th className="py-2 pr-4">Source</th>
          <th className="py-2 pr-4 tabular-nums">Publiée</th>
          <th className="py-2 pr-4">Actions</th>
        </tr>
      </thead>
      <tbody>
        {offers.map((offer) => (
          <tr key={offer.id} className="border-b border-[var(--color-border)]">
            <td className="py-2 pr-4">
              <a
                href={offer.applyUrl ?? offer.canonicalUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[var(--color-accent)] hover:underline"
              >
                {offer.title}
              </a>
            </td>
            <td className="py-2 pr-4">{offer.company.name}</td>
            <td className="py-2 pr-4">{offer.location.city}</td>
            <td className="py-2 pr-4">
              {offer.originSource ? `${offer.originSource} (via ${offer.source})` : offer.source}
            </td>
            <td className="py-2 pr-4 tabular-nums">{offer.postedAt?.slice(0, 10) ?? "—"}</td>
            <td className="py-2 pr-4">
              <EventButtons offerId={offer.id} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
