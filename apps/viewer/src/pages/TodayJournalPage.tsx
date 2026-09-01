import { useQuery } from "@tanstack/react-query";
import { fetchTodayJournal } from "../api";
import { journalDayLabel } from "../format";
import { LoadError } from "../ui/States";
import { JournalPage } from "./JournalPage";

export function TodayJournalPage() {
  const today = useQuery({
    queryKey: ["journal-today"],
    queryFn: fetchTodayJournal,
    retry: false,
  });

  if (today.data?.node.id) {
    return <JournalPage id={today.data.node.id} initial={today.data} />;
  }
  if (today.isError) {
    return <LoadError onRetry={() => void today.refetch()} />;
  }
  return (
    <div className="journal-page" data-surface="journal-page">
      <div className="journal-page-column">
        <div className="journal-day">{journalDayLabel()}</div>
        <p className="journal-loading">Opening the page…</p>
      </div>
    </div>
  );
}
