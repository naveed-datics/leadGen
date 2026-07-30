import { ProposalsListPage } from "@/components/ProposalsListPage";

export default function RepliedProposalsPage() {
  return (
    <ProposalsListPage
      status="replied"
      title="Needs follow-up"
      description="Leads who replied and are ready for follow-up."
      emptyMessage="No replies yet."
      dateLabel="Replied"
      dateField="repliedAt"
      showDashboardBack
    />
  );
}
