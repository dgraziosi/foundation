import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { fetchTodayJournal } from "../api";
import { useShell } from "../shell/context";
import { LoadError, Placeholders } from "../ui/States";

export function TodayJournalPage() {
  const { openDetail } = useShell();
  const today = useQuery({
    queryKey: ["journal-today"],
    queryFn: fetchTodayJournal,
    retry: false,
  });

  useEffect(() => {
    if (today.data?.node.id) {
      openDetail(today.data.node.id, today.data.node.title);
    }
  }, [today.data, openDetail]);

  if (today.isError) {
    return <LoadError onRetry={() => void today.refetch()} />;
  }
  return <Placeholders />;
}
