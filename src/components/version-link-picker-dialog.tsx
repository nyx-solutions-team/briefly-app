"use client";

import type { DocumentPickerDialogProps } from "@/components/document-picker-dialog";
import { DocumentPickerDialog } from "@/components/document-picker-dialog";

export function VersionLinkPickerDialog(props: DocumentPickerDialogProps) {
  return (
    <DocumentPickerDialog
      title="Select document to link as new version"
      {...props}
    />
  );
}
