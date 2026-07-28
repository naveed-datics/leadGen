import { ProposalsListPage } from "@/components/ProposalsListPage";

export default function SentProposalsPage() {
  return (
    <ProposalsListPage
      status="sent"
      title="Applied / submitted"
      description="Proposals sent to leads via WhatsApp."
      emptyMessage="No proposals sent yet."
      dateLabel="Sent"
      dateField="sentAt"
    />
  );
}
