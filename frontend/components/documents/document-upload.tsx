"use client";

import React, { useState } from "react";
import { FileUp, UploadCloud, X } from "lucide-react";
import { upload_document } from "@/lib/api";
import { formatBytes } from "@/lib/utils";
import { ApiRequestError } from "@/types/api";
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
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [docType, setDocType] = useState("");
  const [author, setAuthor] = useState("");
  const [department, setDepartment] = useState("");
  const [tags, setTags] = useState("");
  const [language, setLanguage] = useState("en");
  const [validationError, setValidationError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const validateSelectedFile = (candidate: File | null): string | null => {
    if (!candidate) {
      return "Please select a file to upload.";
    }
    if (candidate.size === 0) {
      return "Uploaded file cannot be empty (code: empty_file).";
    }
    if (candidate.size > MAX_UPLOAD_SIZE_BYTES) {
      return `File exceeds the maximum allowed size of 50 MB (${formatBytes(
        MAX_UPLOAD_SIZE_BYTES
      )}).`;
    }
    const lowerName = candidate.name.toLowerCase();
    const matchesExtension = ALLOWED_EXTENSIONS.some((ext) =>
      lowerName.endsWith(ext)
    );
    if (!matchesExtension) {
      return `Unsupported file extension. Allowed formats: ${ALLOWED_EXTENSIONS.join(
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
        title: "202 Accepted — Ingestion Queued",
        description: `"${response.document.title}" stored in MinIO and queued as job ${response.job_id.slice(
          0,
          8
        )}.`,
      });

      setFile(null);
      setTitle("");
      setDocType("");
      setAuthor("");
      setDepartment("");
      setTags("");
      onUploadAccepted?.(response);
    } catch (error) {
      if (error instanceof ApiRequestError) {
        setValidationError(`${error.message} (${error.code})`);
        pushToast({
          tone: "error",
          title: `Upload Failed (${error.code})`,
          description: error.message,
          requestId: error.request_id,
        });
      } else {
        setValidationError("Unexpected error during document upload.");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <UploadCloud className="h-5 w-5 text-primary" />
              Ingest New Document
            </CardTitle>
            <CardDescription>
              Uploads original bytes to MinIO (`rag-documents`), writes
              PostgreSQL metadata, and queues async adaptive chunking (`202
              Accepted`).
            </CardDescription>
          </div>
          <span className="font-mono text-xs text-muted-foreground">
            Max 50 MB · TXT, MD, PDF, DOCX, PPTX, HTML
          </span>
        </div>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="rounded-lg border border-dashed border-border bg-surface-elevated p-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <label className="flex cursor-pointer items-center gap-3 text-sm">
                <span className="flex h-10 w-10 items-center justify-center rounded-md bg-primary-muted text-primary">
                  <FileUp className="h-5 w-5" />
                </span>
                <div>
                  <span className="font-medium text-foreground">
                    {file ? file.name : "Choose document file"}
                  </span>
                  <p className="text-xs text-muted-foreground">
                    {file
                      ? `${formatBytes(file.size)} · ${
                          file.type || "detected by extension"
                        }`
                      : "Supported: .pdf, .docx, .pptx, .md, .txt, .html"}
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
                  className="inline-flex items-center gap-1 self-start sm:self-center rounded-md border border-border px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground"
                >
                  <X className="h-3.5 w-3.5" />
                  Clear
                </button>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                Document Title
              </label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Information Security Policy v4"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                Document Type (`doc_type`)
              </label>
              <Input
                value={docType}
                onChange={(e) => setDocType(e.target.value)}
                placeholder="e.g. policy, contract, sop"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                Department (`department`)
              </label>
              <Input
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
                placeholder="e.g. Legal, Security, Engineering"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                Author (`author`)
              </label>
              <Input
                value={author}
                onChange={(e) => setAuthor(e.target.value)}
                placeholder="e.g. Compliance Office"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                Tags (comma-separated)
              </label>
              <Input
                value={tags}
                onChange={(e) => setTags(e.target.value)}
                placeholder="security, iso27001, access-control"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                Language (`language`)
              </label>
              <Input
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                placeholder="en"
              />
            </div>
          </div>

          {validationError && (
            <div className="rounded-md border border-danger/40 bg-danger/10 px-3.5 py-2.5 text-xs text-danger">
              {validationError}
            </div>
          )}

          <div className="flex justify-end">
            <Button
              type="submit"
              variant="primary"
              isLoading={isSubmitting}
              disabled={!file}
            >
              <UploadCloud className="h-4 w-4" />
              Upload & Queue Ingestion
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
