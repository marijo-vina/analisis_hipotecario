import { Clock, CheckSquare, Cpu, Sparkles } from "lucide-react";

interface DashboardMetricsProps {
  counts: {
    PENDING_DOCUMENTS: number;
    DOCUMENTS_UPLOADED: number;
    DOCUMENTS_PROCESSED: number;
    PRELIMINARY_RESULT: number;
  };
}

export default function DashboardMetrics({ counts }: DashboardMetricsProps) {
  const metrics = [
    {
      code: "PENDING_DOCUMENTS",
      title: "Pendientes de documentos",
      count: counts.PENDING_DOCUMENTS,
      bgColor: "bg-[#FFF6F6]",
      borderColor: "border-[#F0C9CF]",
      textColor: "text-[#1F1F21]",
      icon: <Clock className="w-5 h-5 text-amber-600 shrink-0" strokeWidth={2} />,
    },
    {
      code: "DOCUMENTS_UPLOADED",
      title: "Documentación completa",
      count: counts.DOCUMENTS_UPLOADED,
      bgColor: "bg-[#F6FAFF]",
      borderColor: "border-[#D6E0F8]",
      textColor: "text-[#1F1F21]",
      icon: <CheckSquare className="w-5 h-5 text-sky-600 shrink-0" strokeWidth={2} />,
    },
    {
      code: "DOCUMENTS_PROCESSED",
      title: "Documentos procesados",
      count: counts.DOCUMENTS_PROCESSED,
      bgColor: "bg-[#F5FCF8]",
      borderColor: "border-[#DCFCE7]",
      textColor: "text-[#1F1F21]",
      icon: <Cpu className="w-5 h-5 text-emerald-600 shrink-0" strokeWidth={2} />,
    },
    {
      code: "PRELIMINARY_RESULT",
      title: "Con resultado preliminar",
      count: counts.PRELIMINARY_RESULT,
      bgColor: "bg-[#FAF7FF]",
      borderColor: "border-[#E9D5FF]",
      textColor: "text-[#1F1F21]",
      icon: <Sparkles className="w-5 h-5 text-purple-600 shrink-0" strokeWidth={2} />,
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {metrics.map((m) => (
        <div
          key={m.code}
          className={`${m.bgColor} p-5 rounded-[12px] border ${m.borderColor} shadow-[0px_2px_6px_rgba(0,0,0,0.02)] flex flex-col justify-between transition-transform hover:-translate-y-0.5`}
        >
          <div className="flex items-start justify-between gap-2">
            <h3 className="text-xs font-semibold text-gf-text-muted uppercase tracking-wider">
              {m.title}
            </h3>
            {m.icon}
          </div>
          <div className="mt-4 flex items-baseline">
            <span className="text-3xl font-bold text-gf-text tracking-tight">
              {m.count}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}
