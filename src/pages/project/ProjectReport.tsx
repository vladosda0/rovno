// A published client report inside the project: /project/:id/reports
// (?report=<id> for an earlier one). Task rovno#237.
//
// The participant reads it through the get-project-report Edge Function, which
// checks the session; the public link's token is never involved. The report
// itself is the same ClientReportReader the public page shows.

import { useMemo } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowLeft } from "lucide-react";
import { ClientReportReader, REPORT_PARAM, type ClientReportReaderQuery } from "@/components/client-report/ClientReportReader";
import { useProjectReports } from "@/hooks/use-project-reports";

export default function ProjectReport() {
  const { id = "" } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const reportId = searchParams.get(REPORT_PARAM);
  const { t } = useTranslation();
  const query = useProjectReports(id, reportId);

  const readerQuery = useMemo<ClientReportReaderQuery>(() => ({
    data: query.data === undefined ? undefined : (query.data?.shared ?? null),
    isSuccess: query.isSuccess,
    isError: query.isError,
    refetch: async () => {
      const result = await query.refetch();
      return { ...result, data: result.data?.shared ?? null } as Awaited<ReturnType<ClientReportReaderQuery["refetch"]>>;
    },
  }), [query]);

  return (
    <ClientReportReader
      query={readerQuery}
      invalid={!id}
      padded={false}
      header={(
        <Link
          to={`/project/${id}/dashboard`}
          className="inline-flex items-center gap-1 self-start text-body-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          {t("projectReport.backToDashboard")}
        </Link>
      )}
      notFoundBody={<p className="max-w-sm text-body-sm text-muted-foreground">{t("projectReport.notFoundBody")}</p>}
    />
  );
}
