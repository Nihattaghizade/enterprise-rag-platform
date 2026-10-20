"use client";

import React, { useCallback, useEffect, useState } from "react";
import { FileUp, UploadCloud, X } from "lucide-react";
import { getTrialStatus, upload_document } from "@/lib/api";
import { use_auth } from "@/lib/auth";
import { formatBytes } from "@/lib/utils";
import { ApiRequestError, type TrialStatusResponse } from "@/types/api";
import {
  ALLOWED_EXTENSIONS,
  MAX_UPLOAD_SIZE_BYTES,
  type DocumentUploadAcceptedResponse,
} from "@/types/document";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useToast } from "@/components/ui/toast";

export function DocumentUpload({
  onUploadAccepted,
}: {
  onUploadAccepted?: (result: DocumentUploadAcceptedResponse) => void;
}) {
  const { pushToast } = useToast();
  const { session } = use_auth();
  const [trialStatus, setTrialStatus] = useState<TrialStatusResponse | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [docType, setDocType] = useState("");
  const [author, setAuthor] = useState("");
  const [department, setDepartment] = useState("");
  const [tags, setTags] = useState("");
  const [language, setLanguage] = useState("en");
  const [validationError, setValidationError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fetchTrial = useCallback(async () => {
    if (session?.tenant_id) {
      try {
        const res = await getTrialStatus(session.tenant_id);
        setTrialStatus(res);
      } catch {
        // ignore
      }
    }
  }, [session?.tenant_id]);

  useEffect(() => {
    fetchTrial();
  }, [fetchTrial]);

  const validateSelectedFile = (candidate: File | null): string | null => {
    if (!candidate) {
      return "Please select a file to upload.";
    }
    if (candidate.size === 0) {
      return "The selected file is empty.";
    }
    if (candidate.size > MAX_UPLOAD_SIZE_BYTES) {
      return `File exceeds the 50 MB size limit (${formatBytes(
        MAX_UPLOAD_SIZE_BYTES
      )}).`;
    }
    const lowerName = candidate.name.toLowerCase();
    const matchesExtension = ALLOWED_EXTENSIONS.some((ext) =>
      lowerName.endsWith(ext)
    );
    if (!matchesExtension) {
      return `Unsupported file format. Supported formats: ${ALLOWED_EXTENSIONS.join(
        ", "
      )}`;
    }
    return null;
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const chosen = e.target.files?.[0] ?? null;
    setFile(chosen);
    if (chosen) {
      const err = validateSelectedFile(chosen);
      setValidationError(err);
      if (!title.trim()) {
        setTitle(chosen.name.replace(/\.[^/.]+$/, ""));
      }
    } else {
      setValidationError(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const err = validateSelectedFile(file);
    if (err || !file) {
      setValidationError(err);
      return;
    }

    setValidationError(null);
    setIsSubmitting(true);

    try {
      const response = await upload_document({
        file,
        title: title.trim() || undefined,
        doc_type: docType.trim() || undefined,
        author: author.trim() || undefined,
        department: department.trim() || undefined,
        tags: tags.trim() || undefined,
        language: language.trim() || undefined,
      });

      pushToast({
        tone: "success",
        title: "Document Upload Started",
        description: `"${response.document.title}" is now being indexed in the background.`,
      });

      setFile(null);
      setTitle("");
      setDocType("");
      setAuthor("");
      setDepartment("");
      setTags("");
      fetchTrial();
      onUploadAccepted?.(response);
    } catch (error) {
      if (error instanceof ApiRequestError) {
        setValidationError(error.message);
        pushToast({
          tone: "error",
          title: "Upload Failed",
          description: error.message,
        });
      } else {
        setValidationError("An unexpected error occurred during upload.");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2">
              <UploadCloud className="h-5 w-5 text-primary" />
              Add Document to Knowledge Base
            </CardTitle>
            <CardDescription>
              Upload documents to make them searchable by your workspace AI
              assistant.
            </CardDescription>
          </div>
          <span className="text-xs font-medium text-muted-foreground">
            Up to 50 MB · PDF, DOCX, PPTX, MD, TXT, HTML
          </span>
        </div>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          {trialStatus?.is_trial && (
            <div className="rounded-xl border border-sky-500/30 bg-sky-950/20 p-4">
              <div className="flex items-center justify-between text-xs font-medium">
                <span className="text-zinc-200">Evaluation Sandbox Upload Limit</span>
                <span className="font-mono text-sky-400 font-semibold">
                  {trialStatus.documents_uploaded} / {trialStatus.max_documents} files
                </span>
              </div>
              <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-zinc-800">
                <div
                  className={`h-full transition-all duration-300 ${
                    trialStatus.documents_uploaded >= trialStatus.max_documents
                      ? "bg-amber-500"
                      : "bg-sky-500"
                  }`}
                  style={{
                    width: `${Math.min(
                      100,
                      (trialStatus.documents_uploaded / trialStatus.max_documents) * 100
                    )}%`,
                  }}
                />
              </div>
              {trialStatus.documents_uploaded >= trialStatus.max_documents && (
                <p className="mt-2 text-xs text-amber-300 font-medium">
                  Trial upload limit reached ({trialStatus.documents_uploaded}/{trialStatus.max_documents} files). Contact a workspace administrator to upgrade to an enterprise tier.
                </p>
              )}
            </div>
          )}

          <div className="rounded-xl border border-dashed border-border bg-surface-elevated p-4 transition-colors hover:border-primary/40">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <label className="flex cursor-pointer items-center gap-3.5 text-sm">
                <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary-muted text-primary">
                  <FileUp className="h-5 w-5" />
                </span>
                <div>
                  <span className="font-semibold text-foreground">
                    {file ? file.name : "Select a document file"}
                  </span>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {file
                      ? `${formatBytes(file.size)}`
                      : "Click to browse PDF, Word, PowerPoint, Markdown, HTML, or TXT files"}
                  </p>
                </div>
                <input
                  type="file"
                  accept=".txt,.md,.html,.htm,.pdf,.docx,.pptx"
                  onChange={handleFileChange}
                  className="sr-only"
                />
              </label>

              {file && (
                <button
                  type="button"
                  onClick={() => {
                    setFile(null);
                    setValidationError(null);
                  }}
                  className="inline-flex items-center gap-1 self-start sm:self-center rounded-lg border border-border px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  <X className="h-3.5 w-3.5" />
                  Remove
                </button>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-foreground">
                Document Title
              </label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Global Information Security Policy"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-foreground">
                Document Category
              </label>
              <Input
                value={docType}
                onChange={(e) => setDocType(e.target.value)}
                placeholder="e.g. Policy, Contract, Guide"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-foreground">
                Department
              </label>
              <Input
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
                placeholder="e.g. Legal, Security, HR"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-foreground">
                Author / Owner
              </label>
              <Input
                value={author}
                onChange={(e) => setAuthor(e.target.value)}
                placeholder="e.g. Security Governance Team"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-foreground">
                Tags (comma-separated)
              </label>
              <Input
                value={tags}
                onChange={(e) => setTags(e.target.value)}
                placeholder="security, compliance, access-control"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-foreground">
                Language
              </label>
              <Input
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                placeholder="en"
              />
            </div>
          </div>

          {validationError && (
            <div className="rounded-lg border border-danger/40 bg-danger/10 px-3.5 py-2.5 text-xs text-danger">
              {validationError}
            </div>
          )}

          <div className="flex justify-end">
            <Button
              type="submit"
              variant="primary"
              isLoading={isSubmitting}
              disabled={
                !file ||
                (trialStatus?.is_trial
                  ? trialStatus.documents_uploaded >= trialStatus.max_documents
                  : false)
              }
            >
              <UploadCloud className="h-4 w-4" />
              Upload & Index Document
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
