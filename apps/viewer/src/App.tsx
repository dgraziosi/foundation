import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { BrowserRouter, Navigate, Route, Routes, useLocation, useParams } from "react-router-dom";
import { AuthError, session } from "./api";
import { DetailPage } from "./pages/DetailPage";
import { HomePage } from "./pages/HomePage";
import { RecentsPage } from "./pages/RecentsPage";
import { TodayJournalPage } from "./pages/TodayJournalPage";
import { TypeViewPage } from "./pages/TypeViewPage";
import { UnlockPage } from "./pages/UnlockPage";
import { Shell } from "./shell/Shell";
import { LoadError, Placeholders } from "./ui/States";
import { ThemeProvider } from "./theme";

function TypeViewRoute() {
  const { slug } = useParams();
  return <TypeViewPage key={slug} />;
}

function Gate() {
  const location = useLocation();
  const query = useQuery({
    queryKey: ["session"],
    queryFn: session,
    retry: false,
  });
  if (query.isLoading) {
    return <Placeholders />;
  }
  if (query.error instanceof AuthError) {
    return <UnlockPage />;
  }
  if (query.isError) {
    return <LoadError onRetry={() => void query.refetch()} />;
  }
  return (
    <Routes location={location}>
      <Route element={<Shell />}>
        <Route path="/" element={<HomePage />} />
        <Route path="/recents" element={<RecentsPage />} />
        <Route path="/journal/today" element={<TodayJournalPage />} />
        <Route path="/types/:slug" element={<TypeViewRoute />} />
        <Route path="/nodes/:id" element={<DetailPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

export function App() {
  const client = useMemo(
    () =>
      new QueryClient({
        defaultOptions: { queries: { refetchOnWindowFocus: false, staleTime: 10_000 } },
      }),
    [],
  );
  return (
    <ThemeProvider>
      <QueryClientProvider client={client}>
        <BrowserRouter basename="/view">
          <Gate />
        </BrowserRouter>
      </QueryClientProvider>
    </ThemeProvider>
  );
}
