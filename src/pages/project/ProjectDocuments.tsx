import { useState } from "react";
import { useParams } from "react-router-dom";
import {
  FileText, Upload, Plus, Archive, Trash2, Download, Eye,
  CheckCircle2, MessageSquare, GitBranch, Printer,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle,
  AlertDialogDescription, AlertDialogFooter, AlertDialogAction, AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import { StatusBadge } from "@/components/StatusBadge";
import { ConfirmModal } from "@/components/ConfirmModal";
import { PreviewCard } from "@/components/ai/PreviewCard";
import { ActionBar } from "@/components/ai/ActionBar";
import { EmptyState } from "@/components/EmptyState";
import { toast } from "@/hooks/use-toast";
import { useCurrentUser, useDocuments, useProject } from "@/hooks/use-mock-data";
import { usePermission, isOwnerOrCoOwner } from "@/lib/permissions";
import {
  addDocument, updateDocument, addDocumentVersion, deleteDocument,
  addEvent,
} from "@/data/store";
import type { Document as DocType, DocumentVersion } from "@/types/entities";
import type { ProposalChange } from "@/types/ai";

function docStatusLabel(s: string) {
  if (s === "draft") return "Draft";
  if (s === "active") return "Approved";
  if (s === "archived") return "Archived";
  if (s === "awaiting_approval") return "Draft"; // map to draft badge
  return s;
}

export default function ProjectDocuments() {
  const { id: projectId } = useParams<{ id: string }>();
  const pid = projectId!;
  const documents = useDocuments(pid);
  const { project } = useProject(pid);
  const perm = usePermission(pid);
  const user = useCurrentUser();
  const isOwner = isOwnerOrCoOwner(perm.role);
  const isContractor = perm.role === "contractor";

  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadTitle, setUploadTitle] = useState("");
  const [uploadType, setUploadType] = useState("specification");
  const [generateOpen, setGenerateOpen] = useState(false);
  const [generateTitle, setGenerateTitle] = useState("");
  const [generateContent, setGenerateContent] = useState("");
  const [showGenPreview, setShowGenPreview] = useState(false);
  const [viewDoc, setViewDoc] = useState<DocType | null>(null);
  const [archiveDocId, setArchiveDocId] = useState<string | null>(null);
  const [deleteDocId, setDeleteDocId] = useState<string | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [newVersionDocId, setNewVersionDocId] = useState<string | null>(null);
  const [showNewVersionPreview, setShowNewVersionPreview] = useState(false);
  const [commentOpen, setCommentOpen] = useState(false);
  const [commentText, setCommentText] = useState("");

  const activeDocuments = documents.filter((d) => {
    const latest = d.versions[d.versions.length - 1];
    return latest?.status !== "archived";
  });
  const archivedDocuments = documents.filter((d) => {
    const latest = d.versions[d.versions.length - 1];
    return latest?.status === "archived";
  });

  /* --- Upload --- */
  function handleUpload() {
    const docId = `doc-${Date.now()}`;
    const verId = `dv-${Date.now()}`;
    addDocument({
      id: docId,
      project_id: pid,
      type: uploadType,
      title: uploadTitle || "Untitled document",
      versions: [{
        id: verId,
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
      payload: { title: uploadTitle, type: uploadType },
    });
    setUploadOpen(false);
    setUploadTitle("");
    toast({ title: "Document uploaded", description: uploadTitle || "Untitled" });
  }

  /* --- Generate via AI --- */
  function handleGeneratePreview() {
    setGenerateContent(`AI-generated draft for "${generateTitle}".\n\nThis document outlines the terms and conditions for the ${project?.title ?? "project"}.`);
    setShowGenPreview(true);
  }

  function handleGenerateConfirm() {
    const docId = `doc-gen-${Date.now()}`;
    const verId = `dv-gen-${Date.now()}`;
    addDocument({
      id: docId,
      project_id: pid,
      type: "contract",
      title: generateTitle || "Generated Document",
      versions: [{
        id: verId,
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

  /* --- New version --- */
  function handleNewVersionPreview() {
    setShowNewVersionPreview(true);
  }

  function handleCreateNewVersion() {
    if (!newVersionDocId) return;
    const doc = documents.find((d) => d.id === newVersionDocId);
    if (!doc) return;
    const latest = doc.versions[doc.versions.length - 1];
    const verId = `dv-new-${Date.now()}`;
    addDocumentVersion(newVersionDocId, {
      id: verId,
      document_id: newVersionDocId,
      number: doc.versions.length + 1,
      status: "awaiting_approval",
      content: latest.content + "\n\n[Updated in v" + (doc.versions.length + 1) + "]",
    });
    addEvent({
      id: `evt-${Date.now()}`,
      project_id: pid,
      actor_id: user.id,
      type: "document_version_created",
      object_type: "document",
      object_id: newVersionDocId,
      timestamp: new Date().toISOString(),
      payload: { title: doc.title, version: doc.versions.length + 1 },
    });
    setNewVersionDocId(null);
    setShowNewVersionPreview(false);
    toast({ title: "New version created", description: `v${doc.versions.length + 1} awaiting approval` });
  }

  /* --- Archive --- */
  function handleArchive() {
    if (!archiveDocId) return;
    const doc = documents.find((d) => d.id === archiveDocId);
    if (!doc) return;
    const latest = doc.versions[doc.versions.length - 1];
    addDocumentVersion(archiveDocId, {
      ...latest,
      id: `dv-arch-${Date.now()}`,
      number: doc.versions.length + 1,
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
      payload: { title: doc.title },
    });
    setArchiveDocId(null);
    toast({ title: "Document archived" });
  }

  /* --- Delete --- */
  function handleDelete() {
    if (!deleteDocId) return;
    const doc = documents.find((d) => d.id === deleteDocId);
    deleteDocument(deleteDocId);
    addEvent({
      id: `evt-${Date.now()}`,
      project_id: pid,
      actor_id: user.id,
      type: "document_deleted",
      object_type: "document",
      object_id: deleteDocId,
      timestamp: new Date().toISOString(),
      payload: { title: doc?.title },
    });
    setDeleteDocId(null);
    toast({ title: "Document deleted" });
  }

  /* --- Contractor acknowledge --- */
  function handleAcknowledge(doc: DocType) {
    addEvent({
      id: `evt-${Date.now()}`,
      project_id: pid,
      actor_id: user.id,
      type: "document_acknowledged",
      object_type: "document",
      object_id: doc.id,
      timestamp: new Date().toISOString(),
      payload: { title: doc.title },
    });
    setViewDoc(null);
    toast({ title: "Acknowledged", description: doc.title });
  }

  /* --- Export --- */
  function handleExport() {
    setExportOpen(false);
    toast({ title: "Export generated", description: "Document ready for download." });
  }

  /* --- Comment --- */
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

  if (documents.length === 0) {
    return (
      <EmptyState
        icon={FileText}
        title="No documents"
        description="Upload a document or generate one with AI."
        actionLabel={perm.can("document.create") ? "Upload" : undefined}
        onAction={perm.can("document.create") ? () => setUploadOpen(true) : undefined}
      />
    );
  }

  const genPreviewChanges: ProposalChange[] = [
    { entity_type: "document", action: "create", label: generateTitle || "Document", after: "Draft v1" },
  ];

  const newVerDoc = newVersionDocId ? documents.find((d) => d.id === newVersionDocId) : null;
  const newVerChanges: ProposalChange[] = newVerDoc
    ? [{ entity_type: "document", action: "update", label: newVerDoc.title, before: `v${newVerDoc.versions.length}`, after: `v${newVerDoc.versions.length + 1}` }]
    : [];

  return (
    <div className="space-y-sp-2">
      {/* Header */}
      <div className="glass-elevated rounded-card p-sp-2 flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-h3 text-foreground">Documents</h2>
          <p className="text-caption text-muted-foreground">{activeDocuments.length} active · {archivedDocuments.length} archived</p>
        </div>
        {perm.can("document.create") && (
          <div className="flex gap-1.5">
            <Button size="sm" variant="outline" onClick={() => setUploadOpen(true)}>
              <Upload className="h-4 w-4 mr-1.5" /> Upload
            </Button>
            <Button size="sm" className="bg-accent text-accent-foreground hover:bg-accent/90" onClick={() => setGenerateOpen(true)}>
              <Plus className="h-4 w-4 mr-1.5" /> Generate
            </Button>
          </div>
        )}
      </div>

      {/* Active docs table */}
      {activeDocuments.length > 0 && (
        <div className="glass rounded-card overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Document</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Version</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-32"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {activeDocuments.map((doc) => {
                const latest = doc.versions[doc.versions.length - 1];
                return (
                  <TableRow key={doc.id}>
                    <TableCell>
                      <button onClick={() => setViewDoc(doc)} className="text-body-sm font-medium text-foreground hover:text-accent transition-colors text-left">
                        {doc.title}
                      </button>
                    </TableCell>
                    <TableCell className="text-caption text-muted-foreground capitalize">{doc.type}</TableCell>
                    <TableCell className="text-caption text-muted-foreground">v{latest.number}</TableCell>
                    <TableCell>
                      <StatusBadge status={docStatusLabel(latest.status)} variant="estimate" />
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1 justify-end">
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setViewDoc(doc)} title="View">
                          <Eye className="h-3.5 w-3.5" />
                        </Button>
                        {isOwner && (
                          <>
                            <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => { setNewVersionDocId(doc.id); handleNewVersionPreview(); }} title="New version">
                              <GitBranch className="h-3.5 w-3.5" />
                            </Button>
                            <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setExportOpen(true)} title="Export">
                              <Download className="h-3.5 w-3.5" />
                            </Button>
                            <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setArchiveDocId(doc.id)} title="Archive">
                              <Archive className="h-3.5 w-3.5" />
                            </Button>
                            <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setDeleteDocId(doc.id)} title="Delete">
                              <Trash2 className="h-3.5 w-3.5 text-destructive" />
                            </Button>
                          </>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Archived section */}
      {archivedDocuments.length > 0 && (
        <div className="space-y-1">
          <h3 className="text-body-sm font-semibold text-muted-foreground px-1">Archived</h3>
          <div className="glass rounded-card overflow-hidden opacity-60">
            <Table>
              <TableBody>
                {archivedDocuments.map((doc) => (
                  <TableRow key={doc.id}>
                    <TableCell className="text-body-sm text-muted-foreground">{doc.title}</TableCell>
                    <TableCell className="text-caption text-muted-foreground capitalize">{doc.type}</TableCell>
                    <TableCell><StatusBadge status="Archived" variant="estimate" /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {/* New version preview */}
      {showNewVersionPreview && newVersionDocId && (
        <div className="space-y-2">
          <PreviewCard
            summary={`Create new version of "${newVerDoc?.title}"`}
            changes={newVerChanges}
          />
          <ActionBar
            onConfirm={handleCreateNewVersion}
            onCancel={() => { setNewVersionDocId(null); setShowNewVersionPreview(false); }}
          />
        </div>
      )}

      {/* Upload modal */}
      <AlertDialog open={uploadOpen} onOpenChange={setUploadOpen}>
        <AlertDialogContent className="glass-modal rounded-modal">
          <AlertDialogHeader>
            <AlertDialogTitle>Upload document</AlertDialogTitle>
            <AlertDialogDescription>Add a document to this project.</AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-3 py-2">
            <div className="rounded-lg bg-warning/10 text-warning text-caption p-2">
              ⚠ Do not upload documents containing personal identification data without consent.
            </div>
            <div className="space-y-1">
              <label className="text-body-sm font-medium text-foreground">Title</label>
              <Input value={uploadTitle} onChange={(e) => setUploadTitle(e.target.value)} placeholder="Document name" autoFocus />
            </div>
            <div className="space-y-1">
              <label className="text-body-sm font-medium text-foreground">Type</label>
              <select value={uploadType} onChange={(e) => setUploadType(e.target.value)} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                <option value="contract">Contract</option>
                <option value="specification">Specification</option>
                <option value="warranty">Warranty</option>
                <option value="report">Report</option>
              </select>
            </div>
            <div className="border-2 border-dashed border-border rounded-lg p-6 text-center">
              <Upload className="mx-auto h-8 w-8 text-muted-foreground/40 mb-2" />
              <p className="text-caption text-muted-foreground">Drag file here or click to browse</p>
            </div>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleUpload} className="bg-accent text-accent-foreground hover:bg-accent/90">Upload</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Generate modal */}
      <AlertDialog open={generateOpen} onOpenChange={(o) => { setGenerateOpen(o); if (!o) setShowGenPreview(false); }}>
        <AlertDialogContent className="glass-modal rounded-modal max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle>Generate document</AlertDialogTitle>
            <AlertDialogDescription>AI will create a draft based on your description.</AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <label className="text-body-sm font-medium text-foreground">Document title</label>
              <Input value={generateTitle} onChange={(e) => setGenerateTitle(e.target.value)} placeholder="e.g. Subcontractor Agreement" autoFocus />
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
                <PreviewCard summary="Generate document" changes={genPreviewChanges} />
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

      {/* View document modal */}
      <AlertDialog open={!!viewDoc} onOpenChange={(o) => !o && setViewDoc(null)}>
        <AlertDialogContent className="glass-modal rounded-modal max-w-lg">
          {viewDoc && (() => {
            const latest = viewDoc.versions[viewDoc.versions.length - 1];
            return (
              <>
                <AlertDialogHeader>
                  <AlertDialogTitle>{viewDoc.title}</AlertDialogTitle>
                  <AlertDialogDescription>
                    v{latest.number} · {viewDoc.type} · <StatusBadge status={docStatusLabel(latest.status)} variant="estimate" />
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <div className="glass rounded-card p-3 my-2 max-h-64 overflow-y-auto">
                  <p className="text-body-sm text-foreground whitespace-pre-wrap">{latest.content}</p>
                </div>
                {viewDoc.versions.length > 1 && (
                  <div className="text-caption text-muted-foreground">
                    {viewDoc.versions.length} version(s) available
                  </div>
                )}
                <AlertDialogFooter className="flex-wrap gap-1">
                  {isContractor && (
                    <>
                      <Button size="sm" onClick={() => handleAcknowledge(viewDoc)} className="bg-accent text-accent-foreground hover:bg-accent/90">
                        <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Confirm acknowledgement
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => { setCommentOpen(true); }}>
                        <MessageSquare className="h-3.5 w-3.5 mr-1" /> Comment
                      </Button>
                    </>
                  )}
                  <AlertDialogCancel>Close</AlertDialogCancel>
                </AlertDialogFooter>
              </>
            );
          })()}
        </AlertDialogContent>
      </AlertDialog>

      {/* Comment modal */}
      <AlertDialog open={commentOpen} onOpenChange={setCommentOpen}>
        <AlertDialogContent className="glass-modal rounded-modal">
          <AlertDialogHeader>
            <AlertDialogTitle>Leave a comment</AlertDialogTitle>
          </AlertDialogHeader>
          <Textarea value={commentText} onChange={(e) => setCommentText(e.target.value)} placeholder="Your comment..." className="min-h-[60px]" />
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleComment} className="bg-accent text-accent-foreground hover:bg-accent/90" disabled={!commentText.trim()}>
              Submit
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Export modal */}
      <ConfirmModal
        open={exportOpen}
        onOpenChange={setExportOpen}
        title="Export document"
        description="Choose export format."
        confirmLabel="Export"
        onConfirm={handleExport}
        onCancel={() => setExportOpen(false)}
        tertiaryLabel="Print"
        onTertiary={() => { setExportOpen(false); toast({ title: "Print dialog opened" }); }}
      />

      {/* Archive confirm */}
      <ConfirmModal
        open={!!archiveDocId}
        onOpenChange={(o) => !o && setArchiveDocId(null)}
        title="Archive document?"
        description="This document will be moved to the archive."
        confirmLabel="Archive"
        onConfirm={handleArchive}
        onCancel={() => setArchiveDocId(null)}
      />

      {/* Delete confirm */}
      <ConfirmModal
        open={!!deleteDocId}
        onOpenChange={(o) => !o && setDeleteDocId(null)}
        title="Delete document?"
        description="This will permanently remove the document and all its versions."
        confirmLabel="Delete"
        onConfirm={handleDelete}
        onCancel={() => setDeleteDocId(null)}
      />
    </div>
  );
}
