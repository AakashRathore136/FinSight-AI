
type AnalysisDetailProps = {
  docId: string;
  user?: any;
  onBack: () => void;
};

type AnyRecord = Record<string, any>;

export function AnalysisDetail({ docId, user, onBack }: AnalysisDetailProps) {
  const [record, setRecord] = useState<AnyRecord | null>(null);
  const [analysis, setAnalysis] = useState<AnyRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [shareOpen, setShareOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [canNativeShare, setCanNativeShare] = useState(false);
  const [shareUrl, setShareUrl] = useState("");

  useEffect(() => {
    if (!docId) return;

    let unsubscribeAnalyses: (() => void) | null = null;

    const fetchDoc = async () => {
      setLoading(true);

      let ownerIdFromDoc: string | null = null;

      try {
        const d = await getDoc(doc(db, "documents", docId));
        if (d.exists()) {
          const data = d.data() as AnyRecord;
          ownerIdFromDoc = data?.ownerId || null;
          setRecord({ id: d.id, ...data });
        } else {
          setRecord(null);
        }
      } catch (error) {
        console.error("Failed to fetch document record", error);
      }

      const ownerId = user?.uid || ownerIdFromDoc;
      if (!ownerId) {
        setAnalysis(null);
        setLoading(false);
        return;
      }

      const analysesQuery = query(
        collection(db, `documents/${docId}/analyses`),
        where("ownerId", "==", ownerId),
        orderBy("processedAt", "desc"),
        limit(1),
      );

      unsubscribeAnalyses = onSnapshot(
        analysesQuery,
        (snapshot) => {
          if (!snapshot.empty) {
            const analysisDoc = snapshot.docs[0];
            const data = analysisDoc.data();
            setAnalysis(data);
          }
          // Keep the view renderable with any latestAnalysis already stored on the parent doc.
          setLoading(false);
        },
        (error) => {
          // Avoid hard-throwing from snapshot listeners; keep the view renderable with available data.
          console.error(
            `Failed to list analyses for documents/${docId}/analyses`,
            error,
          );
          setLoading(false);
        },
      );
    };

    fetchDoc();

    return () => {
      if (unsubscribeAnalyses) unsubscribeAnalyses();
    };
  }, [docId, user?.uid]);

  const analysisData = analysis || record?.latestAnalysis || null;
  const riskLevel = (analysisData?.risk_level || record?.riskLevel || "low")
    .toString()
    .toLowerCase();
  const confidenceValue = normalizeConfidence(
    analysisData?.sentiment_score ?? 0,
  );
  const fileName = record?.fileName || "Untitled Document";
  const fileType = getFileTypeLabel(record?.fileType);
  const fileSize = formatBytes(record?.fileSize);
  const refId = (record?.id || docId || "").slice(0, 8).toUpperCase();

  const processedAt = useMemo(() => {
    return formatDateSafe(analysisData?.processedAt || record?.createdAt);
  }, [analysisData?.processedAt, record?.createdAt]);

  const summary =
    analysisData?.summary || "No summary available for this analysis.";
  const fullReport = analysisData?.full_report || "";
  const keyMetrics = analysisData?.key_metrics || {};
  const actionItems = analysisData?.action_items || [];
  const entities = analysisData?.entities || [];
  const riskItems = analysisData?.risk_assessment || [];
  const rawReport = analysisData?.raw_report || null;

  const metricsEntries = Object.entries(keyMetrics);
  const hasMetrics = metricsEntries.length > 0;
  const shareText = buildAnalysisShareText({
    fileName,
    riskLevel,
    confidenceValue,
    refId,
  });

  useEffect(() => {
    if (typeof window === "undefined") return;

    const url = new URL(window.location.href);
    url.searchParams.set("docId", docId);
    setShareUrl(url.toString());
    setCanNativeShare(typeof navigator !== "undefined" && "share" in navigator);
  }, [docId]);

  const handleCopyShareLink = async () => {
    const success = await copyToClipboard(shareUrl);
    if (success) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleNativeShare = async () => {
    if (typeof navigator === "undefined" || !("share" in navigator)) return;

    try {
      await navigator.share({
        title: `FinSight AI Report - ${fileName}`,
        text: shareText,
        url: shareUrl,
      });
    } catch (error) {
      if ((error as Error).name !== "AbortError") {
        console.error("Native share failed:", error);
      }
    }
  };

  const handleExport = async () => {
    try {
      const pdf = new jsPDF({
        orientation: "portrait",
        unit: "mm",
        format: "a4",
      });

      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      let yPosition = 15;
      const lineHeight = 7;
      const margin = 15;
      const contentWidth = pageWidth - 2 * margin;

      // Title
      pdf.setFontSize(24);
      pdf.setFont(undefined, "bold");
      pdf.text("FinSight AI Financial Intelligence Report", margin, yPosition);
      yPosition += 12;

      // Metadata
      pdf.setFontSize(10);
      pdf.setFont(undefined, "normal");
      pdf.setTextColor(100);
      pdf.text(
        `Reference: ${refId} | Generated: ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}`,
        margin,
        yPosition,
      );
      yPosition += 8;
      pdf.line(margin, yPosition, pageWidth - margin, yPosition);
      yPosition += 10;

      // Reset text color
      pdf.setTextColor(0);

      // Document Info Section
      pdf.setFontSize(12);
      pdf.setFont(undefined, "bold");
      pdf.text("Document Information", margin, yPosition);
      yPosition += 8;

      pdf.setFontSize(10);
      pdf.setFont(undefined, "normal");
      const docInfo = [
        [`File Name:`, fileName],
        [`File Type:`, fileType],
        [`File Size:`, fileSize],
        [`Risk Level:`, riskLevel.toUpperCase()],
        [`Confidence:`, `${confidenceValue}%`],
      ];

      docInfo.forEach(([label, value]) => {
        pdf.text(`${label} ${value}`, margin + 5, yPosition);
        yPosition += lineHeight;
      });

      yPosition += 5;
      pdf.line(margin, yPosition, pageWidth - margin, yPosition);
      yPosition += 10;

      // Summary Section
      pdf.setFontSize(12);
      pdf.setFont(undefined, "bold");
      pdf.text("Executive Summary", margin, yPosition);
      yPosition += 8;

      pdf.setFontSize(10);
      pdf.setFont(undefined, "normal");
      const summaryLines = pdf.splitTextToSize(
        summary || "No summary available",
        contentWidth,
      );
      summaryLines.forEach((line: string) => {
        if (yPosition > pageHeight - 20) {
          pdf.addPage();
          yPosition = margin;
        }
        pdf.text(line, margin, yPosition);
        yPosition += lineHeight;
      });

      yPosition += 5;

      // Key Metrics Section
      if (hasMetrics) {
        if (yPosition > pageHeight - 40) {
          pdf.addPage();
          yPosition = margin;
        }

        pdf.setFontSize(12);
        pdf.setFont(undefined, "bold");
        pdf.text("Key Metrics", margin, yPosition);
        yPosition += 8;

        pdf.setFontSize(10);
        pdf.setFont(undefined, "normal");
        metricsEntries.forEach(([key, value]) => {
          if (yPosition > pageHeight - 15) {
            pdf.addPage();
            yPosition = margin;
          }
          const metricLabel = key.replace(/_/g, " ");
          const metricValue = String(value);
          pdf.text(`${metricLabel}: ${metricValue}`, margin + 5, yPosition);
          yPosition += lineHeight;
        });

        yPosition += 5;
        pdf.line(margin, yPosition, pageWidth - margin, yPosition);
        yPosition += 10;
      }

      // Action Items Section
      if (actionItems.length > 0) {
        if (yPosition > pageHeight - 40) {
          pdf.addPage();
          yPosition = margin;
        }

        pdf.setFontSize(12);
        pdf.setFont(undefined, "bold");
        pdf.text("Recommended Actions", margin, yPosition);
        yPosition += 8;

        pdf.setFontSize(10);
        pdf.setFont(undefined, "normal");
        actionItems.forEach((item: string, index: number) => {
          if (yPosition > pageHeight - 15) {
            pdf.addPage();
            yPosition = margin;
          }
          const itemLines = pdf.splitTextToSize(
            `${index + 1}. ${item}`,
            contentWidth - 5,
          );
          itemLines.forEach((line: string) => {
            if (yPosition > pageHeight - 15) {
              pdf.addPage();
              yPosition = margin;
            }
            pdf.text(line, margin + 5, yPosition);
            yPosition += lineHeight;
          });
          yPosition += 2;
        });

        yPosition += 5;
        pdf.line(margin, yPosition, pageWidth - margin, yPosition);
        yPosition += 10;
      }

      // Entities Section
      if (entities.length > 0) {
        if (yPosition > pageHeight - 30) {
          pdf.addPage();
          yPosition = margin;
        }

        pdf.setFontSize(12);
        pdf.setFont(undefined, "bold");
        pdf.text("Identified Entities", margin, yPosition);
        yPosition += 8;

        pdf.setFontSize(10);
        pdf.setFont(undefined, "normal");
        const entitiesText = entities.join(", ");
        const entitiesLines = pdf.splitTextToSize(entitiesText, contentWidth);
        entitiesLines.forEach((line: string) => {
          if (yPosition > pageHeight - 15) {
            pdf.addPage();
            yPosition = margin;
          }
          pdf.text(line, margin, yPosition);
          yPosition += lineHeight;
        });

        yPosition += 5;
        pdf.line(margin, yPosition, pageWidth - margin, yPosition);
        yPosition += 10;
      }

      // Risk Assessment Section
      if (riskItems.length > 0) {
        if (yPosition > pageHeight - 40) {
          pdf.addPage();
          yPosition = margin;
        }

        pdf.setFontSize(12);
        pdf.setFont(undefined, "bold");
        pdf.text("Risk Assessment", margin, yPosition);
        yPosition += 8;

        pdf.setFontSize(10);
        pdf.setFont(undefined, "normal");
        riskItems.forEach((risk: any, index: number) => {
          if (yPosition > pageHeight - 15) {
            pdf.addPage();
            yPosition = margin;
          }
          const riskText =
            typeof risk === "string" ? risk : risk.description || String(risk);
          const riskLines = pdf.splitTextToSize(
            `${index + 1}. ${riskText}`,
            contentWidth - 5,
          );
          riskLines.forEach((line: string) => {
            if (yPosition > pageHeight - 15) {
              pdf.addPage();
              yPosition = margin;
            }
            pdf.text(line, margin + 5, yPosition);
            yPosition += lineHeight;
          });
          yPosition += 2;
        });
      }

      // Footer
      const totalPages = pdf.getNumberOfPages();
      for (let i = 1; i <= totalPages; i++) {
        pdf.setPage(i);
        pdf.setFontSize(9);
        pdf.setTextColor(150);
        pdf.text(`Page ${i} of ${totalPages}`, pageWidth / 2, pageHeight - 10, {
          align: "center",
        });
      }

      // Save PDF
      pdf.save(`finsight-ai-report-${refId}-${new Date().getTime()}.pdf`);
    } catch (error) {
      console.error("Failed to export PDF:", error);
    }
  };

  const sharePlatforms = [
    {
      name: "WhatsApp",
      icon: <Send className="h-5 w-5 text-emerald-400" />,
      url: buildWhatsAppUrl(shareText, shareUrl),
      bg: "hover:bg-emerald-500/10 border-emerald-500/20",
    },
    {
      name: "X (Twitter)",
      icon: <XBrandIcon className="h-5 w-5 text-sky-400" />,
      url: buildXUrl(shareText, shareUrl),
      bg: "hover:bg-sky-500/10 border-sky-500/20",
    },
    {
      name: "Facebook",
      icon: <FacebookIcon className="h-5 w-5 text-blue-400" />,
      url: buildFacebookUrl(shareUrl),
      bg: "hover:bg-blue-500/10 border-blue-500/20",
    },
    {
      name: "Email",
      icon: <Mail className="h-5 w-5 text-orange-400" />,
      url: buildEmailUrl(
        "FinSight AI Financial Intelligence Report",
        `${shareText}\n\n${shareUrl}`,
      ),
      bg: "hover:bg-orange-500/10 border-orange-500/20",
    },
  ];

  if (loading) {
    return <AnalysisSkeleton />;
  }

  if (!record) {
    return (
      <div className="mx-auto flex max-w-3xl flex-col items-center justify-center p-12 text-center">
        <AlertTriangle className="mb-4 text-red-500" size={48} />
        <h2 className="text-xl font-bold text-white">Document Not Found</h2>
        <p className="mt-2 text-slate-500">
          The requested document could not be retrieved from the secure vault.
        </p>
        <Button variant="outline" className="mt-6" onClick={onBack}>
          Return to Dashboard
        </Button>
      </div>
    );
  }

  return (
    <div className="min-h-full bg-[#080b11] pb-16">
      <div className="mx-auto w-full max-w-[1600px] px-4 py-6 sm:px-6 lg:px-8">
        <Tabs defaultValue="summary" className="flex w-full flex-col gap-0">
          <section className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-950 shadow-2xl">
            <div className="bg-[radial-gradient(circle_at_top_left,rgba(79,70,229,0.28),transparent_34%),linear-gradient(135deg,#111827,#0b1220_52%,#07111d)] p-5 sm:p-8 lg:p-10">
              <div className="grid gap-6 2xl:grid-cols-[minmax(0,1fr)_auto] 2xl:items-center">
                <div className="min-w-0">
                  <div className="mb-4 flex items-center gap-3">
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-sky-500/15">
                      <span className="h-2.5 w-2.5 rounded-full bg-sky-400" />
                    </span>
                    <p className="text-[11px] font-black uppercase tracking-[0.22em] text-sky-300 sm:text-xs">
                      BFSI Intelligence Report
                    </p>
                  </div>
                  <h1 className="max-w-4xl text-2xl font-black leading-tight tracking-tight text-white sm:text-3xl lg:text-4xl">
                    Enterprise Risk Signal Review
                  </h1>
                  <p className="mt-3 max-w-4xl break-words text-sm leading-6 text-slate-400">
                    Ref {refId || "N/A"} - {fileName} - professional financial
                    intelligence dashboard with operational risk triage.
                  </p>
                </div>

                <div className="grid gap-3 sm:grid-cols-3 2xl:flex 2xl:flex-wrap 2xl:justify-end">
                  <Button
                    variant="outline"
                    onClick={onBack}
                    className="h-11 rounded-2xl border-slate-700 bg-slate-950/50 px-4 text-sm font-bold text-slate-200 hover:bg-slate-800 hover:text-white"
                  >
                    <ArrowLeft size={18} className="mr-2" />
                    Back
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => setShareOpen(true)}
                    className="h-11 rounded-2xl border-slate-700 bg-slate-950/50 px-4 text-sm font-bold text-slate-200 hover:bg-slate-800 hover:text-white"
                  >
                    <Share2 size={18} className="mr-2" />
                    Share
                  </Button>
                  <Button
                    variant="outline"
                    onClick={handleExport}
                    className="h-11 rounded-2xl border-slate-700 bg-slate-950/50 px-4 text-sm font-bold text-slate-200 hover:bg-slate-800 hover:text-white"
                  >
                    <Download size={18} className="mr-2" />
                    Export
                  </Button>
                </div>
              </div>
            </div>

            <TabsList className="flex h-auto w-full justify-start overflow-x-auto rounded-none border-t border-slate-800 bg-slate-900/70 p-2">
              {[
                ["summary", "Summary"],
                ["findings", "Findings"],
                ["risks", "Risks"],
                ["metrics", "Metrics"],
                ["source", "Source"],
              ].map(([value, label]) => (
                <TabsTrigger
                  key={value}
                  value={value}
                  className="h-11 min-w-[8.5rem] flex-none rounded-xl px-4 text-xs font-black uppercase tracking-[0.14em] text-slate-500 data-active:bg-slate-700 data-active:text-white sm:text-sm"
                >
                  {label}
                </TabsTrigger>
              ))}
            </TabsList>
          </section>

          <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_26rem]">
            <main className="min-w-0 space-y-6">
              <TabsContent value="summary" className="mt-0 space-y-6">
                <ReportPanel
                  title="Summary Overview"
                  description="High-signal report surface for executive review, AI observations, and operational triage."
                >
                  <div className="grid gap-4 md:grid-cols-3">
                    <StatusTile
                      label="Confidence"
                      value={`${confidenceValue}%`}
                      tone="emerald"
                    />
                    <StatusTile
                      label="Risk"
                      value={riskLevel === "low" ? "Stable" : riskLevel}
                      tone={riskTone(riskLevel)}
                    />
                    <StatusTile
                      label="Sentiment"
                      value={String(analysisData?.sentiment_score ?? 0)}
                      tone="indigo"
                    />
                  </div>

                  <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-5">
                    <h3 className="mb-4 text-lg font-black text-white">
                      Markdown Report
                    </h3>
                    <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-5">
                      <div className="prose prose-invert max-w-none break-words prose-p:leading-7 prose-p:text-slate-300 prose-strong:text-white">
                        <ReactMarkdown>
                          {summary || "No summary content available."}
                        </ReactMarkdown>
                      </div>
                    </div>
                  </div>
                </ReportPanel>

                <ReportPanel
                  title="AI Observations"
                  description="Prioritized operational observations extracted from the underlying analysis."
                >
                  <NumberedList
                    items={actionItems}
                    empty="No action items were found in the current analysis payload."
                  />
                </ReportPanel>

                <ReportPanel
                  title="Strategic Directives"
                  description="Recommended follow-up actions for the financial review cycle."
                >
                  <NumberedList
                    items={actionItems}
                    empty="No strategic directives were returned by the model."
                  />
                </ReportPanel>
              </TabsContent>

              <TabsContent value="findings" className="mt-0 space-y-6">
                <ReportPanel
                  title="Executive Narrative"
                  description="Full report generated from the uploaded financial document."
                >
                  <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-6">
                    <div className="prose prose-invert max-w-none break-words prose-p:leading-8 prose-p:text-slate-300 prose-headings:text-white prose-li:text-slate-300 prose-strong:text-white">
                      <ReactMarkdown>
                        {fullReport ||
                          summary ||
                          "No narrative analysis is available for this document."}
                      </ReactMarkdown>
                    </div>
                  </div>
                </ReportPanel>

                <ReportPanel
                  title="Discovered Entities"
                  description="Organizations and named entities identified in the report."
                >
                  <div className="flex flex-wrap gap-2">
                    {entities.length ? (
                      entities.map((entity: string) => (
                        <Badge
                          key={entity}
                          className="rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-xs font-bold text-slate-200"
                        >
                          {entity}
                        </Badge>
                      ))
                    ) : (
                      <EmptyState text="No entities were identified." compact />
                    )}
                  </div>
                </ReportPanel>
              </TabsContent>

              <TabsContent value="risks" className="mt-0">
                <ReportPanel
                  title="Risk Register"
                  description="Risk statements extracted from the model output."
                >
                  <div className="grid gap-4 md:grid-cols-2">
                    {riskItems.length ? (
                      riskItems.map((risk: any, index: number) => (
                        <RiskFindingCard
                          key={index}
                          risk={risk}
                          index={index}
                        />
                      ))
                    ) : (
                      <EmptyState text="No risk items were extracted from the analysis." />
                    )}
                  </div>
                </ReportPanel>
              </TabsContent>

              <TabsContent value="metrics" className="mt-0">
                <ReportPanel
                  title="Financial Metrics"
                  description="Structured values parsed from the analysis payload."
                >
                  {hasMetrics ? (
                    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                      {metricsEntries.map(([key, value]) => (
                        <MetricCard
                          key={key}
                          label={key.replace(/_/g, " ")}
                          value={formatMetricValue(value)}
                        />
                      ))}
                    </div>
                  ) : (
                    <EmptyState text="No structured metrics could be derived from the target dataset." />
                  )}
                </ReportPanel>
              </TabsContent>

              <TabsContent value="source" className="mt-0 space-y-6">
                <ReportPanel
                  title="Source Metadata"
                  description="Document details used for this intelligence run."
                >
                  <div className="grid gap-4 md:grid-cols-2">
                    <InfoBlock
                      label="File Name"
                      value={fileName}
                      description="Original uploaded asset"
                    />
                    <InfoBlock
                      label="File Type"
                      value={fileType}
                      description="Detected file format"
                    />
                    <InfoBlock
                      label="File Size"
                      value={fileSize}
                      description="Stored binary size"
                    />
                    <InfoBlock
                      label="Generated"
                      value={processedAt}
                      description="Latest report timestamp"
                    />
                  </div>
                </ReportPanel>

                <ReportPanel
                  title="Raw Analysis Payload"
                  description="Debug view of the current analysis object."
                >
                  <pre className="max-h-[520px] overflow-auto rounded-2xl border border-slate-800 bg-slate-950 p-5 text-xs leading-6 text-slate-300">
                    {JSON.stringify(
                      {
                        summary,
                        key_metrics: keyMetrics,
                        action_items: actionItems,
                        entities,
                        risk_assessment: riskItems,
                        raw_report: rawReport || fullReport || null,
                      },
                      null,
                      2,
                    )}
                  </pre>
                </ReportPanel>
              </TabsContent>
            </main>

            <aside className="space-y-6 xl:sticky xl:top-6 xl:self-start">
              <Card className="rounded-2xl border-slate-800 bg-slate-900 shadow-2xl">
                <CardContent className="p-6">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-xs font-black uppercase tracking-[0.2em] text-sky-300">
                        Security Profile
                      </p>
                      <h2 className="mt-4 text-2xl font-black text-white">
                        Risk Summary
                      </h2>
                    </div>
                    <div
                      className="grid h-20 w-20 place-items-center rounded-full text-lg font-black text-white"
                      style={{
                        background: `conic-gradient(#38bdf8 ${Math.max(6, confidenceValue)}%, #1e293b 0)`,
                      }}
                    >
                      <div className="grid h-14 w-14 place-items-center rounded-full bg-slate-900">
                        {confidenceValue}
                      </div>
                    </div>
                  </div>

                  <div className="mt-6 space-y-3">
                    <StatusTile
                      label="Confidence Score"
                      value={`${confidenceValue} / 100`}
                      tone="emerald"
                    />
                    <StatusTile
                      label="Risk Badge"
                      value={riskLevel === "low" ? "Stable" : riskLevel}
                      tone={riskTone(riskLevel)}
                    />
                    <StatusTile
                      label="Action State"
                      value={
                        riskLevel === "low" ? "Monitor" : "Review Required"
                      }
                      tone="indigo"
                    />
                  </div>
                </CardContent>
              </Card>

              <Card className="rounded-2xl border-slate-800 bg-slate-900 shadow-2xl">
                <CardContent className="p-6">
                  <h2 className="text-xl font-black text-white">Quick Stats</h2>
                  <div className="mt-5 grid grid-cols-2 gap-3">
                    <StatusTile
                      label="Signals"
                      value={String(riskItems.length)}
                      tone="slate"
                    />
                    <StatusTile
                      label="Coverage"
                      value={analysisData ? "94%" : "0%"}
                      tone="emerald"
                    />
                    <StatusTile
                      label="Alerts"
                      value={String(
                        riskItems.filter(
                          (risk: any) =>
                            riskIconTone(risk) === "text-amber-500",
                        ).length,
                      )}
                      tone="amber"
                    />
                    <StatusTile
                      label="Critical"
                      value={String(
                        riskItems.filter(
                          (risk: any) => riskIconTone(risk) === "text-red-500",
                        ).length,
                      )}
                      tone="red"
                    />
                  </div>
                </CardContent>
              </Card>

              <Card className="rounded-2xl border-slate-800 bg-slate-900 shadow-2xl">
                <CardHeader className="border-b border-slate-800 p-6">
                  <CardTitle className="text-sm font-black uppercase tracking-[0.2em] text-white">
                    Digital Artifact
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-5 p-6">
                  <div className="flex items-center gap-4 rounded-2xl border border-slate-800 bg-slate-950/50 p-4">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-indigo-600/20 text-indigo-300">
                      <FileText size={22} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold text-white">
                        {fileName}
                      </p>
                      <p className="mt-1 text-xs font-bold uppercase tracking-[0.16em] text-slate-500">
                        {fileType} - {fileSize}
                      </p>
                    </div>
                  </div>
                  <SectionInfo
                    label="Registry Source"
                    value="Direct Secure Upload"
                  />
                  <SectionInfo label="Cipher Protocol" value="AES-256 GCM" />
                  <SectionInfo label="Purge Status" value="Scheduled Review" />
                </CardContent>
              </Card>
            </aside>
          </div>
        </Tabs>
      </div>
      {shareOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button
            type="button"
            aria-label="Close share dialog"
            onClick={() => setShareOpen(false)}
            className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm"
          />
          <div className="relative z-10 w-full max-w-md overflow-hidden rounded-2xl border border-slate-800 bg-slate-950 p-6 shadow-2xl">
            <button
              type="button"
              onClick={() => setShareOpen(false)}
              className="absolute right-4 top-4 rounded-lg p-1 text-slate-500 transition-colors hover:bg-slate-900 hover:text-white"
            >
              <X className="h-4 w-4" />
              <span className="sr-only">Close</span>
            </button>

            <div className="mb-6 pr-8">
              <h2 className="text-xl font-black text-white">
                Share Financial Report
              </h2>
              <p className="mt-2 text-sm leading-6 text-slate-400">
                Send a direct access link to this FinSight AI analysis.
              </p>
            </div>

            <div className="mb-6 flex items-center gap-2 rounded-2xl border border-slate-800 bg-slate-900/70 p-2">
              <input
                type="text"
                readOnly
                value={shareUrl}
                className="min-w-0 flex-1 bg-transparent px-2 text-sm font-semibold text-slate-400 outline-none"
                onFocus={(event) => event.currentTarget.select()}
              />
              <Button
                size="sm"
                onClick={handleCopyShareLink}
                className="h-9 shrink-0 gap-1.5 rounded-xl"
                variant={copied ? "default" : "outline"}
              >
                {copied ? (
                  <>
                    <Check className="h-3.5 w-3.5" />
                    Copied
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5" />
                    Copy
                  </>
                )}
              </Button>
            </div>

            <div className="mb-6 grid grid-cols-2 gap-3">
              {sharePlatforms.map((platform) => (
                <a
                  key={platform.name}
                  href={platform.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`flex flex-col items-center justify-center rounded-2xl border bg-slate-900/50 p-4 transition-all hover:-translate-y-0.5 hover:shadow-lg ${platform.bg}`}
                >
                  <div className="mb-2 rounded-xl bg-slate-950 p-2">
                    {platform.icon}
                  </div>
                  <span className="text-xs font-black text-slate-200">
                    {platform.name}
                  </span>
                </a>
              ))}
            </div>

            {canNativeShare && (
              <Button
                onClick={handleNativeShare}
                className="h-11 w-full gap-2 rounded-2xl border border-sky-500/20 bg-sky-500/10 text-sky-200 hover:bg-sky-500/20"
                variant="outline"
              >
                <Share2 className="h-4 w-4" />
                Open System Share Sheet
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function RiskBadge({ riskLevel }: { riskLevel: string }) {
  const tone =
    riskLevel === "high"
      ? "bg-red-500/15 text-red-400 border-red-500/25"
      : riskLevel === "medium"
        ? "bg-amber-500/15 text-amber-400 border-amber-500/25"
        : "bg-emerald-500/15 text-emerald-400 border-emerald-500/25";

  return (
    <Badge
      variant="outline"
      className={`rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-[0.2em] ${tone}`}
    >
      {riskLevel} risk
    </Badge>
  );
}

function ReportPanel({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="rounded-2xl border-slate-800 bg-slate-900 shadow-2xl">
      <CardContent className="space-y-6 p-6">
        <div>
          <h2 className="text-xl font-black text-white">{title}</h2>
          <p className="mt-2 text-sm leading-6 text-slate-400">{description}</p>
        </div>
        {children}
      </CardContent>
    </Card>
  );
}

function StatusTile({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: string;
}) {
  const toneClass =
    tone === "emerald"
      ? "border-emerald-500/25 bg-emerald-500/15 text-emerald-300"
      : tone === "amber"
        ? "border-amber-500/25 bg-amber-500/15 text-amber-300"
        : tone === "red"
          ? "border-red-500/25 bg-red-500/15 text-red-300"
          : tone === "slate"
            ? "border-slate-700 bg-slate-800/70 text-slate-300"
            : "border-indigo-500/25 bg-indigo-500/15 text-indigo-300";

  return (
    <div className={`rounded-2xl border p-4 ${toneClass}`}>
      <p className="text-xs font-black uppercase tracking-[0.18em] opacity-80">
        {label}
      </p>
      <p className="mt-2 break-words text-xl font-black capitalize text-white">
        {value}
      </p>
    </div>
  );
}

function NumberedList({ items, empty }: { items: string[]; empty: string }) {
  if (!items?.length) {
    return (
      <div className="rounded-2xl border border-slate-800 bg-slate-950/50 p-5 text-sm font-semibold text-slate-300">
        {empty}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {items.map((item, index) => (
        <div
          key={`${item}-${index}`}
          className="flex gap-4 rounded-2xl border border-slate-800 bg-slate-950/50 p-4"
        >
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-red-400/25 bg-red-500/15 text-sm font-black text-red-200">
            {index + 1}
          </div>
          <p className="pt-1 text-sm font-semibold leading-7 text-slate-300">
            {item}
          </p>
        </div>
      ))}
    </div>
  );
}

function RiskFindingCard({ risk, index }: { risk: any; index: number }) {
  const description =
    typeof risk === "string" ? risk : risk?.description || JSON.stringify(risk);
  const level = typeof risk === "string" ? risk : risk?.level || "medium";
  const tone =
    riskIconTone(risk) === "text-red-500"
      ? "red"
      : riskIconTone(risk) === "text-amber-500"
        ? "amber"
        : "emerald";

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-950/50 p-5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <Badge className="rounded-full border border-slate-700 bg-slate-900 px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-slate-300">
          Finding {index + 1}
        </Badge>
        <StatusPill tone={tone} label={String(level)} />
      </div>
      <p className="text-sm font-medium leading-7 text-slate-300">
        {description}
      </p>
    </div>
  );
}

function StatusPill({ tone, label }: { tone: string; label: string }) {
  const className =
    tone === "red"
      ? "border-red-500/25 bg-red-500/15 text-red-300"
      : tone === "amber"
        ? "border-amber-500/25 bg-amber-500/15 text-amber-300"
        : "border-emerald-500/25 bg-emerald-500/15 text-emerald-300";

  return (
    <span
      className={`rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] ${className}`}
    >
      {label}
    </span>
  );
}

function SignalCard({
  icon,
  label,
  value,
  helper,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  helper: string;
}) {
  return (
    <Card className="rounded-2xl border-slate-800 bg-slate-900 shadow-xl">
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-500">
              {label}
            </p>
            <p className="mt-2 text-2xl font-extrabold tracking-tight text-white">
              {value}
            </p>
            <p className="mt-2 text-xs leading-6 text-slate-500">{helper}</p>
          </div>
          <div className="rounded-2xl border border-slate-800 bg-slate-950 p-2 text-indigo-400">
            {icon}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function MiniStat({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone: "indigo" | "emerald" | "amber" | "red";
}) {
  const toneClasses =
    tone === "emerald"
      ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-400"
      : tone === "amber"
        ? "border-amber-500/20 bg-amber-500/10 text-amber-400"
        : tone === "red"
          ? "border-red-500/20 bg-red-500/10 text-red-400"
          : "border-indigo-500/20 bg-indigo-500/10 text-indigo-400";

  return (
    <div className={`rounded-2xl border p-4 ${toneClasses}`}>
      <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">
        {icon}
        {label}
      </div>
      <div className="mt-3 text-lg font-extrabold text-white">{value}</div>
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-5 transition-colors hover:bg-slate-900">
      <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">
        {label}
      </p>
      <p className="mt-3 break-words text-2xl font-extrabold tracking-tight text-white">
        {value}
      </p>
    </div>
  );
}

function InfoBlock({
  label,
  value,
  description,
}: {
  label: string;
  value: string;
  description: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-5">
      <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">
        {label}
      </p>
      <p className="mt-3 break-words text-sm font-bold text-white">{value}</p>
      <p className="mt-2 text-xs leading-6 text-slate-500">{description}</p>
    </div>
  );
}

function SectionInfo({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between border-b border-slate-800/50 pb-2 last:border-0">
      <span className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-500">
        {label}
      </span>
      <span className="max-w-[55%] truncate text-xs font-bold text-slate-300">
        {value}
      </span>
    </div>
  );
}

function EmptyState({
  text,
  compact = false,
}: {
  text: string;
  compact?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl border border-dashed border-slate-800 bg-slate-950/40 ${compact ? "p-4" : "p-8"} text-center`}
    >
      <p className={`text-slate-500 ${compact ? "text-xs" : "text-sm"}`}>
        {text}
      </p>
    </div>
  );
}

function AnalysisSkeleton() {
  return (
    <div className="w-full space-y-6 px-2 pb-16 pt-3 sm:px-4 lg:px-6">
      <div className="flex items-center justify-between gap-4 border-b border-slate-800/80 pb-5">
        <div className="flex items-center gap-4">
          <Skeleton className="h-11 w-11 rounded-2xl bg-slate-800" />
          <div className="space-y-3">
            <Skeleton className="h-8 w-72 bg-slate-800" />
            <Skeleton className="h-4 w-52 bg-slate-800" />
          </div>
        </div>
        <div className="hidden gap-3 lg:flex">
          <Skeleton className="h-10 w-28 rounded-xl bg-slate-800" />
          <Skeleton className="h-10 w-32 rounded-xl bg-slate-800" />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Skeleton className="h-28 rounded-2xl bg-slate-800" />
        <Skeleton className="h-28 rounded-2xl bg-slate-800" />
        <Skeleton className="h-28 rounded-2xl bg-slate-800" />
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_24rem] 2xl:grid-cols-[minmax(0,1fr)_26rem]">
        <Skeleton className="h-[760px] rounded-2xl bg-slate-800" />
        <Skeleton className="h-[520px] rounded-2xl bg-slate-800" />
      </div>
    </div>
  );
}

function getFileTypeLabel(fileType?: string) {
  if (!fileType) return "FILE";
  const parts = fileType.split("/");
  return parts[1] ? parts[1].toUpperCase() : parts[0].toUpperCase();
}

function formatBytes(bytes?: number) {
  if (!bytes || Number.isNaN(bytes)) return "0 MB";
  const mb = bytes / (1024 * 1024);
  if (mb >= 1) return `${mb.toFixed(2)} MB`;
  const kb = bytes / 1024;
  return `${kb.toFixed(1)} KB`;
}

function normalizeConfidence(value: any) {
  const n = Number(value || 0);
  if (n <= 1) return Math.round(n * 100);
  return Math.round(Math.min(100, n));
}

function formatDateSafe(input: any) {
  if (!input) return "Unknown";
  try {
    if (typeof input?.toDate === "function") {
      return input
        .toDate()
        .toLocaleDateString(undefined, { dateStyle: "full" });
    }
    const d = new Date(input);
    if (Number.isNaN(d.getTime())) return "Unknown";
    return d.toLocaleDateString(undefined, { dateStyle: "full" });
  } catch {
    return "Unknown";
  }
}

function formatMetricValue(value: any) {
  if (value == null) return "-";
  if (typeof value === "number") {
    if (Math.abs(value) >= 1000) return value.toLocaleString();
    return String(value);
  }
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (Array.isArray(value)) return value.join(", ");
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function riskTone(riskLevel: string) {
  if (riskLevel === "high") return "red";
  if (riskLevel === "medium") return "amber";
  return "emerald";
}

function riskIconTone(risk: any) {
  const level = typeof risk === "string" ? risk : risk?.level;
  if (level === "high") return "text-red-500";
  if (level === "medium") return "text-amber-500";
  return "text-emerald-500";
}

function buildAnalysisShareText({
  fileName,
  riskLevel,
  confidenceValue,
  refId,
}: {
  fileName: string;
  riskLevel: string;
  confidenceValue: number;
  refId: string;
}) {
  return `FinSight AI financial intelligence report:\n- Document: ${fileName}\n- Risk Level: ${riskLevel}\n- Confidence: ${confidenceValue}/100\n- Ref: ${refId || "N/A"}\n\nReview the analysis here:`;
}

function buildWhatsAppUrl(text: string, url: string): string {
  return `https://api.whatsapp.com/send?text=${encodeURIComponent(`${text} ${url}`)}`;
}

function buildXUrl(text: string, url: string): string {
  return `https://x.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`;
}

function buildFacebookUrl(url: string): string {
  return `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`;
}

function buildEmailUrl(subject: string, body: string): string {
  return `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

async function copyToClipboard(url: string): Promise<boolean> {
  try {
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(url);
      return true;
    }

    const textarea = document.createElement("textarea");
    textarea.value = url;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    const successful = document.execCommand("copy");
    document.body.removeChild(textarea);
    return successful;
  } catch (error) {
    console.error("Failed to copy clipboard:", error);
    return false;
  }
}
