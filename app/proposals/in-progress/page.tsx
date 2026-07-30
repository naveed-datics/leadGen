import { ProposalsListPage } from "@/components/ProposalsListPage";

export default function InProgressProposalsPage() {
  return (
    <ProposalsListPage
      status="in_progress"
      title="In progress"
      description="Proposals drafted but not yet sent to the lead."
      emptyMessage="No proposals in progress yet."
      dateLabel="Last updated"
      dateField="updatedAt"
      showDashboardBack
    />
  );
}
