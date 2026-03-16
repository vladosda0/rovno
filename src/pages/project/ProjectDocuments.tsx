import { useState } from "react";
import { useParams } from "react-router-dom";
import {
  Archive,
  Download,
  Eye,
  FileText,
  MessageSquare,
  Plus,
  Printer,
  Share2,
  Trash2,
  Upload,
  CheckCircle2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { ConfirmModal } from "@/components/ConfirmModal";
import { DocumentListItem } from "@/components/documents/DocumentListItem";
import { PreviewCard } from "@/components/ai/PreviewCard";
import { ActionBar } from "@/components/ai/ActionBar";
import { EmptyState } from "@/components/EmptyState";
import { toast } from "@/hooks/use-toast";
import { useCurrentUser, useProject, useWorkspaceMode } from "@/hooks/use-mock-data";
import {
  useProjectDocumentMutations,
  useProjectDocumentsState,
} from "@/hooks/use-documents-media-source";
import { usePermission, isOwnerOrCoOwner } from "@/lib/permissions";
import {
  addDocument,
  addDocumentVersion,
  addEvent,
  deleteDocument as deleteDocumentLocal,
} from "@/data/store";
import type { Document as DocType } from "@/types/entities";
import type { ProposalChange } from "@/types/ai";

const DOCUMENT_DEFAULT_TYPE = "specification";

function ProjectDocumentsSkeleton() {
  return (
    <div className="glass rounded-card p-sp-2" data-testid="documents-skeleton">
      <div className="space-y-3">
        <Skeleton className="h-11 rounded-panel" />
        <Skeleton className="h-11 rounded-panel" />
        <Skeleton className="h-11 rounded-panel" />
      </div>
    </div>
  );
}

function buildDocumentDownloadName(title: string) {
  const normalized = title.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return `${normalized || "document"}.txt`;
}

export default function ProjectDocuments() {
  const { id: projectId } = useParams<{ id: string }>();
  const pid = projectId!;
  const { documents, isLoading } = useProjectDocumentsState(pid);
  const { project } = useProject(pid);
  const workspaceMode = useWorkspaceMode();
  const perm = usePermission(pid);
  const user = useCurrentUser();
  const {
    createDocument,
    archiveDocument,
    deleteDocument: deleteDocumentMutation,
  } = useProjectDocumentMutations(pid);
  const isOwner = isOwnerOrCoOwner(perm.role);
  const isContractor = perm.role === "contractor";
  const isSupabaseMode = workspaceMode.kind === "supabase";

  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadTitle, setUploadTitle] = useState("");
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [generateOpen, setGenerateOpen] = useState(false);
  const [generateTitle, setGenerateTitle] = useState("");
  const [generateContent, setGenerateContent] = useState("");
  const [showGenPreview, setShowGenPreview] = useState(false);
  const [viewDoc, setViewDoc] = useState<DocType | null>(null);
  const [archiveDocId, setArchiveDocId] = useState<string | null>(null);
  const [deleteDocId, setDeleteDocId] = useState<string | null>(null);
  const [commentOpen, setCommentOpen] = useState(false);
  const [commentText, setCommentText] = useState("");

  const activeDocuments = documents.filter((document) => {
    const latestVersion = document.versions[document.versions.length - 1];
    return latestVersion?.status !== "archived";
  });
  const archivedDocuments = documents.filter((document) => {
    const latestVersion = document.versions[document.versions.length - 1];
    return latestVersion?.status === "archived";
  });

  function closeUploadDialog() {
    setUploadOpen(false);
    setUploadTitle("");
    setUploadFile(null);
  }

  async function handleUpload() {
    const title = uploadTitle.trim() || uploadFile?.name || "Untitled document";

    if (!isSupabaseMode) {
      const docId = `doc-${Date.now()}`;
      const versionId = `dv-${Date.now()}`;
      addDocument({
        id: docId,
        project_id: pid,
        type: DOCUMENT_DEFAULT_TYPE,
        title,
        origin: "uploaded",
        versions: [{
          id: versionId,
          document_id: docId,
          number: 1,
          status: "draft",
          content: "Uploaded document content placeholder.",
        }],
      });
      addEvent({
        id: `evt-${Date.now()}`,
        project_id: pid,
        actor_id: user.id,
        type: "document_created",
        object_type: "document",
        object_id: docId,
        timestamp: new Date().toISOString(),
        payload: { title },
      });
      closeUploadDialog();
      toast({ title: "Document uploaded", description: title });
      return;
    }

    try {
      await createDocument({
        type: DOCUMENT_DEFAULT_TYPE,
        title,
        origin: "uploaded",
        initialVersionContent: "Uploaded document content placeholder.",
        initialVersionStatus: "draft",
      });

      closeUploadDialog();
      toast({
        title: "Document created",
        description: "Document metadata saved. File contents are not uploaded yet in Supabase mode.",
      });
    } catch (error) {
      toast({
        title: "Document upload failed",
        description: error instanceof Error ? error.message : "Unable to create the document.",
        variant: "destructive",
      });
    }
  }

  function handleGeneratePreview() {
    setGenerateContent(`AI-generated document for "${generateTitle}".\n\nThis document outlines the terms and conditions for the ${project?.title ?? "project"}.`);
    setShowGenPreview(true);
  }

  function handleGenerateConfirm() {
    if (isSupabaseMode) {
      toast({
        title: "Unavailable in Supabase mode",
        description: "AI-generated document text is not persisted yet in Supabase mode.",
        variant: "destructive",
      });
      return;
    }

    const docId = `doc-gen-${Date.now()}`;
    const versionId = `dv-gen-${Date.now()}`;
    addDocument({
      id: docId,
      project_id: pid,
      type: DOCUMENT_DEFAULT_TYPE,
      title: generateTitle || "Generated document",
      origin: "ai_generated",
      versions: [{
        id: versionId,
        document_id: docId,
        number: 1,
        status: "draft",
        content: generateContent,
      }],
    });
    addEvent({
      id: `evt-${Date.now()}`,
      project_id: pid,
      actor_id: user.id,
      type: "document_created",
      object_type: "document",
      object_id: docId,
      timestamp: new Date().toISOString(),
      payload: { title: generateTitle, generated: true },
    });
    setGenerateOpen(false);
    setShowGenPreview(false);
    setGenerateTitle("");
    setGenerateContent("");
    toast({ title: "Document generated", description: generateTitle });
  }

  async function handleArchive() {
    if (!archiveDocId) return;
    const document = documents.find((entry) => entry.id === archiveDocId);
    if (!document) return;
    const latestVersion = document.versions[document.versions.length - 1];

    if (!isSupabaseMode) {
      addDocumentVersion(archiveDocId, {
        ...latestVersion,
        id: `dv-arch-${Date.now()}`,
        number: document.versions.length + 1,
        status: "archived",
      });
      addEvent({
        id: `evt-${Date.now()}`,
        project_id: pid,
        actor_id: user.id,
        type: "document_archived",
        object_type: "document",
        object_id: archiveDocId,
        timestamp: new Date().toISOString(),
        payload: { title: document.title },
      });
      setArchiveDocId(null);
      toast({ title: "Document archived" });
      return;
    }

    try {
      await archiveDocument({
        documentId: archiveDocId,
        content: latestVersion?.content ?? "",
      });
      setArchiveDocId(null);
      toast({ title: "Document archived" });
    } catch (error) {
      toast({
        title: "Archive failed",
        description: error instanceof Error ? error.message : "Unable to archive the document.",
        variant: "destructive",
      });
    }
  }

  async function handleDelete() {
    if (!deleteDocId) return;
    const document = documents.find((entry) => entry.id === deleteDocId);

    if (!isSupabaseMode) {
      deleteDocumentLocal(deleteDocId);
      addEvent({
        id: `evt-${Date.now()}`,
        project_id: pid,
        actor_id: user.id,
        type: "document_deleted",
        object_type: "document",
        object_id: deleteDocId,
        timestamp: new Date().toISOString(),
        payload: { title: document?.title },
      });
      setDeleteDocId(null);
      setViewDoc(null);
      toast({ title: "Document deleted" });
      return;
    }

    try {
      await deleteDocumentMutation(deleteDocId);
      setDeleteDocId(null);
      setViewDoc(null);
      toast({ title: "Document deleted" });
    } catch (error) {
      toast({
        title: "Delete failed",
        description: error instanceof Error ? error.message : "Unable to delete the document.",
        variant: "destructive",
      });
    }
  }

  function handleAcknowledge(document: DocType) {
    addEvent({
      id: `evt-${Date.now()}`,
      project_id: pid,
      actor_id: user.id,
      type: "document_acknowledged",
      object_type: "document",
      object_id: document.id,
      timestamp: new Date().toISOString(),
      payload: { title: document.title },
    });
    setViewDoc(null);
    toast({ title: "Acknowledged", description: document.title });
  }

  function handleComment() {
    if (!viewDoc || !commentText.trim()) return;
    addEvent({
      id: `evt-${Date.now()}`,
      project_id: pid,
      actor_id: user.id,
      type: "comment_added",
      object_type: "document",
      object_id: viewDoc.id,
      timestamp: new Date().toISOString(),
      payload: { text: commentText },
    });
    setCommentOpen(false);
    setCommentText("");
    toast({ title: "Comment added" });
  }

  function handlePrintDocument() {
    window.print();
  }

  function handleDownloadDocument(projectDocument: DocType, content: string) {
    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = window.document.createElement("a");
    link.href = url;
    link.download = buildDocumentDownloadName(projectDocument.title);
    window.document.body.appendChild(link);
    link.click();
    window.document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  const generatePreviewChanges: ProposalChange[] = [
    { entity_type: "document", action: "create", label: generateTitle || "Document", after: "Ready to review" },
  ];

  const latestViewedVersion = viewDoc?.versions[viewDoc.versions.length - 1];
  const viewedDocumentIsArchived = latestViewedVersion?.status === "archived";
  const canDownloadViewedDocument = Boolean(
    viewDoc
    && !isSupabaseMode
    && latestViewedVersion?.content.trim(),
  );

  return (
    <div className="space-y-sp-2">
      <div className="glass-elevated rounded-card p-sp-2 flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-h3 text-foreground">Documents</h2>
          <p className="text-caption text-muted-foreground">
            {isLoading ? "Loading documents..." : `${activeDocuments.length} active · ${archivedDocuments.length} archived`}
          </p>
          {isSupabaseMode && (
            <p className="text-caption text-muted-foreground mt-1">
              Supabase mode currently saves document records, archive state, and delete actions. File bytes, download, and sharing are coming soon.
            </p>
          )}
        </div>
        {perm.can("document.create") && (
          <div className="flex gap-1.5">
            <Button size="sm" variant="outline" onClick={() => setUploadOpen(true)}>
              <Upload className="h-4 w-4 mr-1.5" /> Upload
            </Button>
            {!isSupabaseMode && (
              <Button size="sm" className="bg-accent text-accent-foreground hover:bg-accent/90" onClick={() => setGenerateOpen(true)}>
                <Plus className="h-4 w-4 mr-1.5" /> Generate
              </Button>
            )}
          </div>
        )}
      </div>

      {isLoading ? (
        <ProjectDocumentsSkeleton />
      ) : documents.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="No documents"
          description={isSupabaseMode
            ? "Create a document record for this project. File upload and full document text persistence are coming soon."
            : "Upload a document or generate one with AI."}
          actionLabel={perm.can("document.create") ? "Upload" : undefined}
          onAction={perm.can("document.create") ? () => setUploadOpen(true) : undefined}
        />
      ) : (
        <>
          {activeDocuments.length > 0 && (
            <div className="glass rounded-card overflow-hidden">
              <div className="divide-y divide-border">
                {activeDocuments.map((document) => (
                  <DocumentListItem
                    key={document.id}
                    title={document.title}
                    details={<span className="text-caption text-muted-foreground">Open preview</span>}
                    onOpen={() => setViewDoc(document)}
                    trailing={(
                      <div className="flex gap-1">
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setViewDoc(document)} title="Preview">
                          <Eye className="h-3.5 w-3.5" />
                        </Button>
                        {isOwner && (
                          <>
                            <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setArchiveDocId(document.id)} title="Archive">
                              <Archive className="h-3.5 w-3.5" />
                            </Button>
                            <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setDeleteDocId(document.id)} title="Delete">
                              <Trash2 className="h-3.5 w-3.5 text-destructive" />
                            </Button>
                          </>
                        )}
                      </div>
                    )}
                  />
                ))}
              </div>
            </div>
          )}

          {archivedDocuments.length > 0 && (
            <div className="space-y-1">
              <h3 className="text-body-sm font-semibold text-muted-foreground px-1">Archived</h3>
              <div className="glass rounded-card overflow-hidden opacity-70">
                <div className="divide-y divide-border">
                  {archivedDocuments.map((document) => (
                    <DocumentListItem
                      key={document.id}
                      title={document.title}
                      muted
                      details={<span className="text-caption text-muted-foreground">Archived document</span>}
                      onOpen={() => setViewDoc(document)}
                      trailing={(
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setViewDoc(document)} title="Preview">
                          <Eye className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    />
                  ))}
                </div>
              </div>
            </div>
          )}
        </>
      )}

      <Dialog
        open={uploadOpen}
        onOpenChange={(open) => {
          if (open) {
            setUploadOpen(true);
            return;
          }
          closeUploadDialog();
        }}
      >
        <DialogContent className="bg-card border border-border rounded-modal max-w-lg shadow-xl p-0 gap-0 [&>button.absolute]:hidden">
          <DialogHeader className="border-b border-border px-5 py-4">
            <DialogTitle>Upload document</DialogTitle>
            <DialogDescription>
              {isSupabaseMode
                ? "Create a document record for this project. The file itself will not upload yet in Supabase mode."
                : "Add a document to this project."}
            </DialogDescription>
          </DialogHeader>
          <div className="px-5 py-4 space-y-4">
            <div className="rounded-panel bg-warning/10 p-3 text-caption text-warning">
              Do not upload documents containing personal identification data without consent.
            </div>
            {isSupabaseMode && (
              <div className="rounded-panel bg-muted/50 p-3 text-caption text-muted-foreground">
                Only the document record will persist for now. File bytes, download, and sharing are coming soon.
              </div>
            )}
            <div className="space-y-1">
              <label className="text-body-sm font-medium text-foreground">Title</label>
              <Input
                value={uploadTitle}
                onChange={(event) => setUploadTitle(event.target.value)}
                placeholder="Document name"
                autoFocus
              />
            </div>
            <div className="space-y-1">
              <label className="text-body-sm font-medium text-foreground">File</label>
              <Input
                type="file"
                onChange={(event) => {
                  const file = event.target.files?.[0] ?? null;
                  setUploadFile(file);
                  if (file && !uploadTitle.trim()) {
                    setUploadTitle(file.name);
                  }
                }}
              />
              <p className="text-caption text-muted-foreground">
                {isSupabaseMode
                  ? "Choose a file to name the record now. The file contents will not persist yet."
                  : "Attach a file now, or create a placeholder document with a title only."}
              </p>
            </div>
          </div>
          <DialogFooter className="border-t border-border px-5 py-4">
            <Button variant="outline" onClick={closeUploadDialog}>Cancel</Button>
            <Button
              className="bg-accent text-accent-foreground hover:bg-accent/90"
              onClick={handleUpload}
              disabled={!uploadTitle.trim() && !uploadFile}
            >
              {isSupabaseMode ? "Create document" : "Upload"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={generateOpen} onOpenChange={(open) => { setGenerateOpen(open); if (!open) setShowGenPreview(false); }}>
        <AlertDialogContent className="glass-modal rounded-modal max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle>Generate document</AlertDialogTitle>
            <AlertDialogDescription>AI will create a document based on your description.</AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <label className="text-body-sm font-medium text-foreground">Document title</label>
              <Input value={generateTitle} onChange={(event) => setGenerateTitle(event.target.value)} placeholder="e.g. Subcontractor Agreement" autoFocus />
            </div>
            {!showGenPreview ? (
              <Button onClick={handleGeneratePreview} disabled={!generateTitle.trim()} className="w-full bg-accent text-accent-foreground hover:bg-accent/90">
                Generate preview
              </Button>
            ) : (
              <div className="space-y-2">
                <div className="glass rounded-card p-3">
                  <p className="text-caption text-muted-foreground mb-1">Preview</p>
                  <p className="text-body-sm text-foreground whitespace-pre-wrap">{generateContent}</p>
                </div>
                <PreviewCard summary="Generate document" changes={generatePreviewChanges} />
                <ActionBar
                  onConfirm={handleGenerateConfirm}
                  onCancel={() => setShowGenPreview(false)}
                />
              </div>
            )}
          </div>
          {!showGenPreview && (
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
            </AlertDialogFooter>
          )}
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={!!viewDoc} onOpenChange={(open) => { if (!open) setViewDoc(null); }}>
        <DialogContent className="bg-card border border-border rounded-modal max-w-lg shadow-xl p-0 gap-0 [&>button.absolute]:hidden">
          {viewDoc && latestViewedVersion && (
            <>
              <DialogHeader className="border-b border-border px-5 py-4">
                <DialogTitle>{viewDoc.title}</DialogTitle>
                <DialogDescription>
                  {viewedDocumentIsArchived ? "Archived document" : "Document preview"}
                </DialogDescription>
              </DialogHeader>
              <div className="px-5 py-4 space-y-4">
                <div className="rounded-panel border border-border bg-muted/30 p-4 max-h-72 overflow-y-auto">
                  {isSupabaseMode && !latestViewedVersion.content ? (
                    <p className="text-body-sm text-muted-foreground whitespace-pre-wrap">
                      Full document text persistence is coming soon in Supabase mode. This record currently stores document metadata only.
                    </p>
                  ) : (
                    <p className="text-body-sm text-foreground whitespace-pre-wrap">{latestViewedVersion.content}</p>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" onClick={handlePrintDocument}>
                    <Printer className="h-3.5 w-3.5 mr-1.5" /> Print
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleDownloadDocument(viewDoc, latestViewedVersion.content)}
                    disabled={!canDownloadViewedDocument}
                  >
                    <Download className="h-3.5 w-3.5 mr-1.5" /> Download
                  </Button>
                  <Button size="sm" variant="outline" disabled>
                    <Share2 className="h-3.5 w-3.5 mr-1.5" /> Share
                  </Button>
                </div>
                <p className="text-caption text-muted-foreground">
                  {isSupabaseMode
                    ? "Download and sharing are coming soon for metadata-only records."
                    : canDownloadViewedDocument
                      ? "Sharing is coming soon."
                      : "Download and sharing are coming soon for this document."}
                </p>
              </div>
              <DialogFooter className="border-t border-border px-5 py-4 flex-wrap gap-2 sm:justify-between sm:space-x-0">
                <div className="flex flex-wrap gap-2">
                  {!isSupabaseMode && isContractor && (
                    <>
                      <Button size="sm" onClick={() => handleAcknowledge(viewDoc)} className="bg-accent text-accent-foreground hover:bg-accent/90">
                        <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Confirm acknowledgement
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setCommentOpen(true)}>
                        <MessageSquare className="h-3.5 w-3.5 mr-1" /> Comment
                      </Button>
                    </>
                  )}
                  {isOwner && viewedDocumentIsArchived && (
                    <Button size="sm" variant="outline" onClick={() => setDeleteDocId(viewDoc.id)} className="text-destructive hover:text-destructive">
                      <Trash2 className="h-3.5 w-3.5 mr-1" /> Delete
                    </Button>
                  )}
                </div>
                <Button size="sm" variant="outline" onClick={() => setViewDoc(null)}>Close</Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={commentOpen} onOpenChange={setCommentOpen}>
        <AlertDialogContent className="glass-modal rounded-modal">
          <AlertDialogHeader>
            <AlertDialogTitle>Leave a comment</AlertDialogTitle>
          </AlertDialogHeader>
          <Textarea value={commentText} onChange={(event) => setCommentText(event.target.value)} placeholder="Your comment..." className="min-h-[60px]" />
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleComment} className="bg-accent text-accent-foreground hover:bg-accent/90" disabled={!commentText.trim()}>
              Submit
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <ConfirmModal
        open={!!archiveDocId}
        onOpenChange={(open) => !open && setArchiveDocId(null)}
        title="Archive document?"
        description="This document will be moved to the archive."
        confirmLabel="Archive"
        onConfirm={handleArchive}
        onCancel={() => setArchiveDocId(null)}
      />

      <ConfirmModal
        open={!!deleteDocId}
        onOpenChange={(open) => !open && setDeleteDocId(null)}
        title="Delete document?"
        description="This will permanently remove the document and all its versions."
        confirmLabel="Delete"
        onConfirm={handleDelete}
        onCancel={() => setDeleteDocId(null)}
      />
    </div>
  );
}
