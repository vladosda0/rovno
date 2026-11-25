// Public client report page: rovno.ai/share/report/:token
//
// Opened without a session by whoever holds the project's report link.
// Everything it knows comes from the get-shared-report Edge Function (see
// data/client-report-source.ts). The token is the only credential; a revoked
// or unknown one answers "not found" and names neither project nor contractor.

import { useParams, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { fetchSharedReport } from "@/data/client-report-source";
import { ClientReportReader, REPORT_PARAM } from "@/components/client-report/ClientReportReader";

const SHARED_REPORT_STALE_TIME_MS = 5 * 60_000;

export default function ShareReport() {
  const { token = "" } = useParams<{ token: string }>();
  const [searchParams] = useSearchParams();
  const reportId = searchParams.get(REPORT_PARAM);
  const { t } = useTranslation();

  const query = useQuery({
    queryKey: ["report-share", token, reportId],
    queryFn: () => fetchSharedReport(token, reportId),
    enabled: Boolean(token),
    staleTime: SHARED_REPORT_STALE_TIME_MS,
    retry: 1,
    placeholderData: keepPreviousData,
  });

  return (
    <ClientReportReader
      query={query}
      invalid={!token}
      notFoundBody={(
        <>
          <p className="max-w-sm text-body-sm text-muted-foreground">{t("share.document.notFoundBody")}</p>
          <p className="max-w-sm text-body-sm text-muted-foreground">{t("clientReport.page.notFoundHint")}</p>
        </>
      )}
    />
  );
}
