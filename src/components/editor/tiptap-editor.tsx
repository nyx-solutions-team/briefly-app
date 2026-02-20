"use client";

import * as React from "react";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import { NodeSelection, TextSelection } from "@tiptap/pm/state";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import { Table, TableView } from "@tiptap/extension-table";
import TableRow from "@tiptap/extension-table-row";
import TableHeader from "@tiptap/extension-table-header";
import TableCell from "@tiptap/extension-table-cell";
import Underline from "@tiptap/extension-underline";
import Link from "@tiptap/extension-link";
import Highlight from "@tiptap/extension-highlight";
import { Color } from "@tiptap/extension-color";
import { TextStyle } from "@tiptap/extension-text-style";
import TextAlign from "@tiptap/extension-text-align";
import type { JSONContent } from "@tiptap/core";
import { Fragment, type Node as ProseMirrorNode } from "@tiptap/pm/model";
import {
  CellSelection,
  TableMap,
  addColumnAfter,
  addRowAfter,
  cellAround,
  cellNear,
  columnResizing,
  deleteColumn,
  deleteRow,
  isInTable,
  tableEditing,
} from "@tiptap/pm/tables";
import type { EditorView } from "@tiptap/pm/view";
import {
  Code,
  CheckSquare,
  Copy,
  GripVertical,
  Heading1,
  Heading2,
  Heading3,
  History,
  Lightbulb,
  Link as LinkIcon,
  List,
  ListOrdered,
  Minus,
  Plus,
  Quote,
  Table as TableIcon,
  Text,
  ArrowUp,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  Columns3,
  ChevronRight,
  Trash2,
  Rows3,
} from "lucide-react";

import {
  TipTapBubbleMenu,
  TipTapToolbar,
} from "@/components/editor/tiptap-toolbar";
import { CalloutBlock, type CalloutTone } from "@/components/editor/extensions/callout";
import { applyHeadingLevel } from "@/components/editor/heading-command";
import { DividerBlock } from "@/components/editor/extensions/divider";
import { DiffMarksExtension } from "@/components/editor/diff/diff-marks-extension";
import { useDiffManager } from "@/components/editor/diff/diff-manager";
import { cn } from "@/lib/utils";

export type TipTapEditorValue = JSONContent;

class NotionLikeTableView extends TableView {
  private readonly editorView: EditorView;

  private readonly bottomFooter: HTMLDivElement;
  private readonly bottomFooterButton: HTMLButtonElement;
  private readonly rightRail: HTMLDivElement;
  private readonly rightAddButton: HTMLButtonElement;

  private readonly handlePointerMoveBound: (event: PointerEvent) => void;
  private readonly handlePointerLeaveBound: (event: PointerEvent) => void;
  private readonly handleScrollBound: () => void;

  private resizeObserver: ResizeObserver | null;

  private activeDrag:
    | null
    | {
      source: "bottom" | "right";
      pointerId: number;
      startX: number;
      startY: number;
      rowsAxisActive: boolean;
      colsAxisActive: boolean;
      rowSnap: number;
      colSnap: number;
      tableRect: DOMRect;
      maxRemovableRows: number;
      maxRemovableCols: number;
    };

  private dragPreviewRoot: HTMLDivElement | null;
  private dragPreviewAddRows: HTMLDivElement | null;
  private dragPreviewAddCols: HTMLDivElement | null;
  private dragPreviewAddCorner: HTMLDivElement | null;
  private dragPreviewDelRows: HTMLDivElement | null;
  private dragPreviewDelCols: HTMLDivElement | null;
  private dragPreviewDelCorner: HTMLDivElement | null;

  constructor(node: ProseMirrorNode, cellMinWidth: number, view: EditorView) {
    super(node, cellMinWidth);
    this.editorView = view;

    this.activeDrag = null;
    this.dragPreviewRoot = null;
    this.dragPreviewAddRows = null;
    this.dragPreviewAddCols = null;
    this.dragPreviewAddCorner = null;
    this.dragPreviewDelRows = null;
    this.dragPreviewDelCols = null;
    this.dragPreviewDelCorner = null;

    // Ensure relative positioning for overlays/controls.
    this.dom.classList.add("editor-table-wrapper");

    const footer = document.createElement("div");
    footer.className = "editor-table-bottom-footer";
    footer.setAttribute("contenteditable", "false");
    footer.setAttribute("data-editor-block-ui", "true");
    footer.setAttribute("data-editor-table-footer-zone", "true");

    const bottomButton = document.createElement("button");
    bottomButton.type = "button";
    bottomButton.className = "editor-table-bottom-footer-button";
    bottomButton.setAttribute("contenteditable", "false");
    bottomButton.setAttribute("data-editor-block-ui", "true");
    bottomButton.setAttribute("data-editor-table-footer-zone", "true");
    bottomButton.setAttribute("aria-label", "Add to table");
    bottomButton.setAttribute("title", "Drag to add/remove rows/columns");
    bottomButton.textContent = "+";
    bottomButton.addEventListener("pointerdown", this.handleBottomAddPointerDown);

    footer.appendChild(bottomButton);
    this.dom.appendChild(footer);
    this.bottomFooter = footer;
    this.bottomFooterButton = bottomButton;

    const rightRail = document.createElement("div");
    rightRail.className = "editor-table-right-rail";
    rightRail.setAttribute("contenteditable", "false");
    rightRail.setAttribute("data-editor-block-ui", "true");

    const rightButton = document.createElement("button");
    rightButton.type = "button";
    rightButton.className = "editor-table-right-rail-button";
    rightButton.setAttribute("contenteditable", "false");
    rightButton.setAttribute("data-editor-block-ui", "true");
    rightButton.setAttribute("aria-label", "Add column");
    rightButton.setAttribute("title", "Drag to add/remove columns (diagonal adds/removes rows)");
    rightButton.textContent = "+";
    rightButton.addEventListener("pointerdown", this.handleRightAddPointerDown);

    rightRail.appendChild(rightButton);
    this.dom.appendChild(rightRail);
    this.rightRail = rightRail;
    this.rightAddButton = rightButton;

    this.handlePointerMoveBound = this.handlePointerMove.bind(this);
    this.handlePointerLeaveBound = this.handlePointerLeave.bind(this);
    this.dom.addEventListener("pointermove", this.handlePointerMoveBound);
    this.dom.addEventListener("pointerleave", this.handlePointerLeaveBound);

    this.resizeObserver = typeof ResizeObserver !== "undefined"
      ? new ResizeObserver(() => {
        this.syncControlsPosition();
      })
      : null;
    this.resizeObserver?.observe(this.dom);
    this.resizeObserver?.observe(this.table);

    this.handleScrollBound = () => {
      this.syncControlsPosition();
    };
    this.dom.addEventListener("scroll", this.handleScrollBound, { passive: true });
    // Layout isn't stable until after mount.
    window.requestAnimationFrame(() => {
      this.syncControlsPosition();
    });
  }

  private syncControlsPosition(): void {
    // The underlying prosemirror-tables TableView can set an inline table width (px)
    // that is narrower than the wrapper. Keep the right add control aligned to the
    // actual table edge (like Notion), not the wrapper edge.
    const wrapperRect = this.dom.getBoundingClientRect();
    const tableRect = this.table.getBoundingClientRect();
    const railRect = this.rightRail.getBoundingClientRect();

    const wrapperLeft = wrapperRect.left + this.dom.clientLeft;
    const wrapperWidth = this.dom.clientWidth;
    const edgeX = tableRect.right - wrapperLeft;
    const railWidth = Math.max(24, Math.round(railRect.width || 0));

    if (!Number.isFinite(edgeX) || !Number.isFinite(wrapperWidth) || wrapperWidth <= 0) return;

    let left = edgeX;
    // If the table edge is visible within the wrapper viewport, keep the rail visible.
    if (edgeX >= 0 && edgeX <= wrapperWidth) {
      // Prefer placing it just outside the table if there's room; otherwise overlap inward.
      left = edgeX + railWidth <= wrapperWidth ? edgeX : Math.max(0, edgeX - railWidth);
    }

    if (!Number.isFinite(left)) return;
    this.rightRail.style.left = `${Math.round(left)}px`;
    this.rightRail.style.right = "auto";

    // Keep the bottom add button centered under the *visible* table region.
    // This avoids it being centered in the wrapper when the table is narrower.
    const innerLeft = wrapperRect.left;
    const innerRight = wrapperRect.right;
    const visibleLeft = Math.max(innerLeft, tableRect.left);
    const visibleRight = Math.min(innerRight, tableRect.right);
    const centerClientX = (visibleLeft + visibleRight) / 2;
    const centerX = centerClientX - innerLeft;
    if (Number.isFinite(centerX)) {
      this.bottomFooter.style.setProperty("--editor-table-footer-center-x", `${Math.round(centerX)}px`);
    }
  }

  private isEditable(): boolean {
    const editable = this.editorView.props.editable;
    if (typeof editable === "function") return Boolean(editable(this.editorView.state));
    return editable !== false;
  }

  private getSnapMetrics(): { rowSnap: number; colSnap: number; rect: DOMRect } {
    const rect = this.table.getBoundingClientRect();
    const firstRow = this.table.querySelector("tr");
    const firstCell = this.table.querySelector("tr:first-child > th, tr:first-child > td");
    const rowRect = firstRow instanceof HTMLElement ? firstRow.getBoundingClientRect() : null;
    const cellRect = firstCell instanceof HTMLElement ? firstCell.getBoundingClientRect() : null;

    const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
    let rowCount = Math.max(1, this.node.childCount || 1);
    let colCount = Math.max(1, this.node.firstChild?.childCount || 1);
    try {
      const map = TableMap.get(this.node);
      rowCount = Math.max(1, map.height || rowCount);
      colCount = Math.max(1, map.width || colCount);
    } catch {
      // Ignore map failures; fall back to DOM/PM heuristics.
    }

    const avgRowHeight = rect.height > 0 ? rect.height / rowCount : 34;
    const avgColWidth = rect.width > 0 ? rect.width / colCount : 120;

    const rowSnapCandidate = Math.round(cellRect?.height || rowRect?.height || avgRowHeight || 34);
    const colSnapCandidate = Math.round(cellRect?.width || avgColWidth || 120);

    // Clamp snapping so dragging adds multiple rows/cols with normal movement.
    const rowSnap = clamp(rowSnapCandidate, 26, 52);
    const colSnap = clamp(colSnapCandidate, 72, 180);
    return { rowSnap, colSnap, rect };
  }

  private resolveEndCellPos(): number | null {
    const body = this.table.tBodies.item(0) ?? this.table;
    const rows = (body as any).rows as HTMLCollectionOf<HTMLTableRowElement> | undefined;
    if (!rows || rows.length === 0) return null;

    const lastRow = rows.item(rows.length - 1);
    if (!lastRow || lastRow.cells.length === 0) return null;

    const lastCell = lastRow.cells.item(lastRow.cells.length - 1);
    if (!(lastCell instanceof HTMLElement)) return null;

    try {
      const domPos = this.editorView.posAtDOM(lastCell, 0);
      return Math.max(1, Math.min(this.editorView.state.doc.content.size, domPos + 1));
    } catch {
      return null;
    }
  }

  private focusSelectionAtTableEnd(): boolean {
    const targetPos = this.resolveEndCellPos();
    if (targetPos === null) return false;

    const { state } = this.editorView;
    const tr = state.tr.setSelection(TextSelection.near(state.doc.resolve(targetPos)));
    this.editorView.dispatch(tr);
    this.editorView.focus();
    return true;
  }

  private getMaxRemovableFromEnd(): { rows: number; cols: number } {
    let map: TableMap;
    try {
      map = TableMap.get(this.node);
    } catch {
      return { rows: 0, cols: 0 };
    }

    const minRows = 1;
    const minCols = 1;

    const isRowRemovable = (rowIndex: number): boolean => {
      const seen = new Set<number>();
      for (let col = 0; col < map.width; col += 1) {
        const cellPos = map.map[rowIndex * map.width + col];
        if (seen.has(cellPos)) continue;
        seen.add(cellPos);

        const rect = map.findCell(cellPos);
        if (rect.top < rowIndex) return false;

        const cell = this.node.nodeAt(cellPos);
        if (!cell) return false;
        if (tableCellHasUserContent(cell)) return false;
      }
      return true;
    };

    const isColRemovable = (colIndex: number): boolean => {
      const seen = new Set<number>();
      for (let row = 0; row < map.height; row += 1) {
        const cellPos = map.map[row * map.width + colIndex];
        if (seen.has(cellPos)) continue;
        seen.add(cellPos);

        const rect = map.findCell(cellPos);
        if (rect.left < colIndex) return false;

        const cell = this.node.nodeAt(cellPos);
        if (!cell) return false;
        if (tableCellHasUserContent(cell)) return false;
      }
      return true;
    };

    let removableRows = 0;
    for (let row = map.height - 1; row >= minRows; row -= 1) {
      if (!isRowRemovable(row)) break;
      removableRows += 1;
    }

    let removableCols = 0;
    for (let col = map.width - 1; col >= minCols; col -= 1) {
      if (!isColRemovable(col)) break;
      removableCols += 1;
    }

    return { rows: removableRows, cols: removableCols };
  }

  private commitResize(rowDelta: number, colDelta: number): void {
    if (!this.isEditable()) return;
    if (rowDelta === 0 && colDelta === 0) return;

    const maxRemovable = this.getMaxRemovableFromEnd();
    const safeRowDelta = rowDelta < 0 ? -Math.min(-rowDelta, maxRemovable.rows) : rowDelta;
    const safeColDelta = colDelta < 0 ? -Math.min(-colDelta, maxRemovable.cols) : colDelta;
    if (safeRowDelta === 0 && safeColDelta === 0) return;

    const addRows = safeRowDelta > 0 ? safeRowDelta : 0;
    const addCols = safeColDelta > 0 ? safeColDelta : 0;
    const delRows = safeRowDelta < 0 ? -safeRowDelta : 0;
    const delCols = safeColDelta < 0 ? -safeColDelta : 0;

    // Delete columns/rows from the end, then add.
    for (let i = 0; i < delCols; i += 1) {
      if (!this.focusSelectionAtTableEnd()) break;
      const ok = deleteColumn(this.editorView.state, this.editorView.dispatch);
      if (!ok) break;
    }
    for (let i = 0; i < delRows; i += 1) {
      if (!this.focusSelectionAtTableEnd()) break;
      const ok = deleteRow(this.editorView.state, this.editorView.dispatch);
      if (!ok) break;
    }
    for (let i = 0; i < addCols; i += 1) {
      if (!this.focusSelectionAtTableEnd()) break;
      addColumnAfter(this.editorView.state, this.editorView.dispatch);
    }
    for (let i = 0; i < addRows; i += 1) {
      if (!this.focusSelectionAtTableEnd()) break;
      addRowAfter(this.editorView.state, this.editorView.dispatch);
    }
  }

  private handlePointerMove(event: PointerEvent) {
    // When not dragging, compute simple hot-zones for bottom/right.
    if (this.activeDrag) return;
    const wrapperRect = this.dom.getBoundingClientRect();
    const tableRect = this.table.getBoundingClientRect();
    const bottomDistance = wrapperRect.bottom - event.clientY;
    const rightDistance = tableRect.right - event.clientX;

    const bottomHot = bottomDistance >= -6 && bottomDistance <= 64;
    const rightHot = rightDistance >= -6 && rightDistance <= 64;

    if (bottomHot) this.dom.classList.add("editor-table-bottom-hot");
    else this.dom.classList.remove("editor-table-bottom-hot");

    if (rightHot) this.dom.classList.add("editor-table-right-hot");
    else this.dom.classList.remove("editor-table-right-hot");
  }

  private handlePointerLeave(_event: PointerEvent) {
    if (this.activeDrag) return;
    this.dom.classList.remove("editor-table-bottom-hot");
    this.dom.classList.remove("editor-table-right-hot");
  }

  private ensureDragPreview(): void {
    if (this.dragPreviewRoot) return;
    const root = document.createElement("div");
    root.className = "editor-table-drag-preview";
    root.setAttribute("aria-hidden", "true");

    const addRows = document.createElement("div");
    addRows.className = "editor-table-drag-preview-area editor-table-drag-preview-add";
    const addCols = document.createElement("div");
    addCols.className = "editor-table-drag-preview-area editor-table-drag-preview-add";
    const addCorner = document.createElement("div");
    addCorner.className = "editor-table-drag-preview-area editor-table-drag-preview-add";

    const delRows = document.createElement("div");
    delRows.className = "editor-table-drag-preview-area editor-table-drag-preview-del";
    const delCols = document.createElement("div");
    delCols.className = "editor-table-drag-preview-area editor-table-drag-preview-del";
    const delCorner = document.createElement("div");
    delCorner.className = "editor-table-drag-preview-area editor-table-drag-preview-del";

    root.appendChild(addRows);
    root.appendChild(addCols);
    root.appendChild(addCorner);
    root.appendChild(delRows);
    root.appendChild(delCols);
    root.appendChild(delCorner);

    document.body.appendChild(root);
    this.dragPreviewRoot = root;
    this.dragPreviewAddRows = addRows;
    this.dragPreviewAddCols = addCols;
    this.dragPreviewAddCorner = addCorner;
    this.dragPreviewDelRows = delRows;
    this.dragPreviewDelCols = delCols;
    this.dragPreviewDelCorner = delCorner;
  }

  private updateDragPreview(rowDelta: number, colDelta: number): void {
    if (!this.activeDrag) return;
    this.ensureDragPreview();
    if (
      !this.dragPreviewRoot
      || !this.dragPreviewAddRows
      || !this.dragPreviewAddCols
      || !this.dragPreviewAddCorner
      || !this.dragPreviewDelRows
      || !this.dragPreviewDelCols
      || !this.dragPreviewDelCorner
    ) {
      return;
    }

    const { rowSnap, colSnap, tableRect } = this.activeDrag;

    const addRows = rowDelta > 0 ? rowDelta : 0;
    const delRows = rowDelta < 0 ? -rowDelta : 0;
    const addCols = colDelta > 0 ? colDelta : 0;
    const delCols = colDelta < 0 ? -colDelta : 0;

    const addRowsH = addRows * rowSnap;
    const delRowsH = delRows * rowSnap;
    const addColsW = addCols * colSnap;
    const delColsW = delCols * colSnap;

    this.dragPreviewRoot.style.setProperty("--editor-table-row-snap", `${rowSnap}px`);
    this.dragPreviewRoot.style.setProperty("--editor-table-col-snap", `${colSnap}px`);

    // Add rows area (below existing table).
    this.dragPreviewAddRows.style.display = addRowsH > 0 ? "block" : "none";
    this.dragPreviewAddRows.style.left = `${tableRect.left}px`;
    this.dragPreviewAddRows.style.top = `${tableRect.bottom}px`;
    this.dragPreviewAddRows.style.width = `${tableRect.width}px`;
    this.dragPreviewAddRows.style.height = `${addRowsH}px`;

    // Add cols area (to the right of existing table).
    this.dragPreviewAddCols.style.display = addColsW > 0 ? "block" : "none";
    this.dragPreviewAddCols.style.left = `${tableRect.right}px`;
    this.dragPreviewAddCols.style.top = `${tableRect.top}px`;
    this.dragPreviewAddCols.style.width = `${addColsW}px`;
    this.dragPreviewAddCols.style.height = `${tableRect.height}px`;

    // Add corner for diagonal growth.
    this.dragPreviewAddCorner.style.display = addRowsH > 0 && addColsW > 0 ? "block" : "none";
    this.dragPreviewAddCorner.style.left = `${tableRect.right}px`;
    this.dragPreviewAddCorner.style.top = `${tableRect.bottom}px`;
    this.dragPreviewAddCorner.style.width = `${addColsW}px`;
    this.dragPreviewAddCorner.style.height = `${addRowsH}px`;

    // Delete rows area (inside bottom of existing table).
    this.dragPreviewDelRows.style.display = delRowsH > 0 ? "block" : "none";
    this.dragPreviewDelRows.style.left = `${tableRect.left}px`;
    this.dragPreviewDelRows.style.top = `${tableRect.bottom - delRowsH}px`;
    this.dragPreviewDelRows.style.width = `${tableRect.width}px`;
    this.dragPreviewDelRows.style.height = `${delRowsH}px`;

    // Delete cols area (inside right of existing table).
    this.dragPreviewDelCols.style.display = delColsW > 0 ? "block" : "none";
    this.dragPreviewDelCols.style.left = `${tableRect.right - delColsW}px`;
    this.dragPreviewDelCols.style.top = `${tableRect.top}px`;
    this.dragPreviewDelCols.style.width = `${delColsW}px`;
    this.dragPreviewDelCols.style.height = `${tableRect.height}px`;

    // Delete corner for diagonal shrink.
    this.dragPreviewDelCorner.style.display = delRowsH > 0 && delColsW > 0 ? "block" : "none";
    this.dragPreviewDelCorner.style.left = `${tableRect.right - delColsW}px`;
    this.dragPreviewDelCorner.style.top = `${tableRect.bottom - delRowsH}px`;
    this.dragPreviewDelCorner.style.width = `${delColsW}px`;
    this.dragPreviewDelCorner.style.height = `${delRowsH}px`;
  }

  private clearDragPreview(): void {
    if (this.dragPreviewRoot) this.dragPreviewRoot.remove();
    this.dragPreviewRoot = null;
    this.dragPreviewAddRows = null;
    this.dragPreviewAddCols = null;
    this.dragPreviewAddCorner = null;
    this.dragPreviewDelRows = null;
    this.dragPreviewDelCols = null;
    this.dragPreviewDelCorner = null;
  }

  private beginDrag(source: "bottom" | "right", event: PointerEvent) {
    if (!this.isEditable()) return;
    event.preventDefault();
    event.stopPropagation();

    // Make sure we keep receiving pointer events while dragging.
    try {
      const target = event.currentTarget as HTMLElement | null;
      target?.setPointerCapture?.(event.pointerId);
    } catch {
      // Ignore failures (e.g., unsupported environments).
    }

    const { rowSnap, colSnap, rect } = this.getSnapMetrics();
    const maxRemovable = this.getMaxRemovableFromEnd();
    this.activeDrag = {
      source,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      rowsAxisActive: false,
      colsAxisActive: false,
      rowSnap,
      colSnap,
      tableRect: rect,
      maxRemovableRows: maxRemovable.rows,
      maxRemovableCols: maxRemovable.cols,
    };

    this.dom.classList.add("editor-table-dragging");
    this.dom.classList.add(source === "bottom" ? "editor-table-dragging-from-bottom" : "editor-table-dragging-from-right");

    window.addEventListener("pointermove", this.handleWindowPointerMove, { passive: false });
    window.addEventListener("pointerup", this.handleWindowPointerUp, { passive: false });
    window.addEventListener("pointercancel", this.handleWindowPointerUp, { passive: false });
  }

  private handleBottomAddPointerDown = (event: PointerEvent) => {
    this.beginDrag("bottom", event);
  };

  private handleRightAddPointerDown = (event: PointerEvent) => {
    this.beginDrag("right", event);
  };

  private handleWindowPointerMove = (event: PointerEvent) => {
    if (!this.activeDrag) return;
    if (event.pointerId !== this.activeDrag.pointerId) return;

    event.preventDefault();

    const dxRaw = event.clientX - this.activeDrag.startX;
    const dyRaw = event.clientY - this.activeDrag.startY;
    const absDx = Math.abs(dxRaw);
    const absDy = Math.abs(dyRaw);
    const axisThreshold = 10;

    // Determine active axes.
    if (!this.activeDrag.rowsAxisActive && absDy >= axisThreshold) this.activeDrag.rowsAxisActive = true;
    if (!this.activeDrag.colsAxisActive && absDx >= axisThreshold) this.activeDrag.colsAxisActive = true;

    const snapRows = absDy < axisThreshold ? 0 : Math.max(1, Math.ceil(absDy / this.activeDrag.rowSnap));
    const snapCols = absDx < axisThreshold ? 0 : Math.max(1, Math.ceil(absDx / this.activeDrag.colSnap));

    let rowDelta = 0;
    let colDelta = 0;

    if (this.activeDrag.source === "bottom") {
      rowDelta = this.activeDrag.rowsAxisActive ? Math.sign(dyRaw) * snapRows : 0;
      colDelta = this.activeDrag.colsAxisActive ? Math.sign(dxRaw) * snapCols : 0;
    } else {
      colDelta = this.activeDrag.colsAxisActive ? Math.sign(dxRaw) * snapCols : 0;
      rowDelta = (this.activeDrag.colsAxisActive && this.activeDrag.rowsAxisActive)
        ? Math.sign(dyRaw) * snapRows
        : 0;
    }

    // Clamp shrink to empty tail rows/cols only.
    if (rowDelta < 0) rowDelta = -Math.min(-rowDelta, this.activeDrag.maxRemovableRows);
    if (colDelta < 0) colDelta = -Math.min(-colDelta, this.activeDrag.maxRemovableCols);

    this.updateDragPreview(rowDelta, colDelta);
  };

  private handleWindowPointerUp = (event: PointerEvent) => {
    if (!this.activeDrag) return;
    if (event.pointerId !== this.activeDrag.pointerId) return;
    event.preventDefault();

    const dxRaw = event.clientX - this.activeDrag.startX;
    const dyRaw = event.clientY - this.activeDrag.startY;
    const absDx = Math.abs(dxRaw);
    const absDy = Math.abs(dyRaw);
    const axisThreshold = 10;

    const colsAxisActive = this.activeDrag.colsAxisActive || absDx >= axisThreshold;
    const rowsAxisActive = this.activeDrag.rowsAxisActive || absDy >= axisThreshold;

    const snapRows = absDy < axisThreshold ? 0 : Math.max(1, Math.ceil(absDy / this.activeDrag.rowSnap));
    const snapCols = absDx < axisThreshold ? 0 : Math.max(1, Math.ceil(absDx / this.activeDrag.colSnap));

    let rowDelta = 0;
    let colDelta = 0;

    if (this.activeDrag.source === "bottom") {
      if (!colsAxisActive && !rowsAxisActive) {
        rowDelta = 1;
      } else {
        rowDelta = rowsAxisActive ? Math.sign(dyRaw) * snapRows : 0;
        colDelta = colsAxisActive ? Math.sign(dxRaw) * snapCols : 0;
      }
    } else {
      if (!colsAxisActive) {
        colDelta = 1;
      } else {
        colDelta = Math.sign(dxRaw) * snapCols;
        rowDelta = (colsAxisActive && rowsAxisActive) ? Math.sign(dyRaw) * snapRows : 0;
      }
    }

    if (rowDelta < 0) rowDelta = -Math.min(-rowDelta, this.activeDrag.maxRemovableRows);
    if (colDelta < 0) colDelta = -Math.min(-colDelta, this.activeDrag.maxRemovableCols);

    this.endDrag();
    this.commitResize(rowDelta, colDelta);
  };

  private endDrag(): void {
    window.removeEventListener("pointermove", this.handleWindowPointerMove as any);
    window.removeEventListener("pointerup", this.handleWindowPointerUp as any);
    window.removeEventListener("pointercancel", this.handleWindowPointerUp as any);
    this.clearDragPreview();
    this.dom.classList.remove("editor-table-dragging");
    this.dom.classList.remove("editor-table-dragging-from-bottom");
    this.dom.classList.remove("editor-table-dragging-from-right");
    this.activeDrag = null;
  }

  destroy() {
    this.endDrag();
    this.dom.removeEventListener("pointermove", this.handlePointerMoveBound);
    this.dom.removeEventListener("pointerleave", this.handlePointerLeaveBound);
    this.dom.removeEventListener("scroll", this.handleScrollBound);
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    this.bottomFooterButton.removeEventListener("pointerdown", this.handleBottomAddPointerDown);
    this.rightAddButton.removeEventListener("pointerdown", this.handleRightAddPointerDown);
    // The upstream TableView has a destroy() at runtime, but its TS type doesn't always expose it.
    (TableView.prototype as any).destroy?.call(this);
  }
}

const DraggableTable = Table.extend({
  draggable: false,

  addOptions() {
    const parentOptions = this.parent?.();
    return {
      HTMLAttributes: parentOptions?.HTMLAttributes ?? {},
      resizable: parentOptions?.resizable ?? false,
      renderWrapper: parentOptions?.renderWrapper ?? false,
      handleWidth: parentOptions?.handleWidth ?? 5,
      cellMinWidth: parentOptions?.cellMinWidth ?? 25,
      View: NotionLikeTableView,
      lastColumnResizable: parentOptions?.lastColumnResizable ?? true,
      allowTableNodeSelection: parentOptions?.allowTableNodeSelection ?? false,
    };
  },

  // TipTap's built-in Table extension only enables the columnResizing plugin when
  // `editor.isEditable` is true at *initialization time*. In this app we often
  // mount the editor read-only first (locks/content), then switch to editable.
  // If we keep the default behavior, the TableView (and our UI-only controls)
  // never mount for that session.
  //
  // Always install columnResizing when `resizable` is enabled; ProseMirror will
  // still disable interactions when `view.editable` is false.
  addProseMirrorPlugins() {
    const plugins: any[] = [];

    if (this.options.resizable) {
      plugins.push(
        columnResizing({
          handleWidth: this.options.handleWidth,
          cellMinWidth: this.options.cellMinWidth,
          defaultCellMinWidth: this.options.cellMinWidth,
          View: this.options.View,
          lastColumnResizable: this.options.lastColumnResizable,
        })
      );
    }

    plugins.push(
      tableEditing({
        allowTableNodeSelection: this.options.allowTableNodeSelection,
      })
    );

    return plugins;
  },
});

type Props = {
  value?: TipTapEditorValue;
  onChange?: (value: TipTapEditorValue) => void;
  onEditorReady?: (editor: Editor) => void;
  placeholder?: string;
  className?: string;
  editable?: boolean;
  showToolbar?: boolean;
  showBubbleMenu?: boolean;
  stickyToolbar?: boolean;
  toolbarStickyOffset?: number;
};

type SlashGroup = "text" | "lists" | "layout" | "media" | "advanced";

type SlashCommand = {
  id: string;
  title: string;
  description: string;
  group: SlashGroup;
  keywords: string[];
  icon: React.ComponentType<{ className?: string }>;
  run: (editor: Editor) => void;
};

type SlashSection = {
  id: string;
  label: string;
  icon?: React.ComponentType<{ className?: string }>;
  commands: SlashCommand[];
};

const SLASH_RECENTS_KEY = "briefly.editor.slash.recent";
const SLASH_RECENTS_LIMIT = 4;

const CALLOUT_TONE_META: Array<{ tone: CalloutTone; label: string; emoji: string; swatch: string }> = [
  { tone: "tip", label: "Tip", emoji: "💡", swatch: "#fdf8d9" },
  { tone: "note", label: "Note", emoji: "📝", swatch: "#e9f2ff" },
  { tone: "warning", label: "Warning", emoji: "⚠️", swatch: "#fdecec" },
  { tone: "success", label: "Success", emoji: "✅", swatch: "#e9f6ee" },
];

type SlashContext = {
  from: number;
  to: number;
  query: string;
};

type HoverBlockState = {
  pos: number;
  nodeType: string;
  top: number;
  left: number;
  bottom: number;
  right: number;
  width: number;
};

type HoverTableCellState = {
  pos: number;
  top: number;
  left: number;
  bottom: number;
  right: number;
};

type BlockColorOption = {
  id: string;
  label: string;
  color: string | null;
  swatch: string;
};

function getChildPos(parent: { child: (idx: number) => { nodeSize: number } }, parentStart: number, index: number): number {
  let pos = parentStart;
  for (let i = 0; i < index; i += 1) {
    pos += parent.child(i).nodeSize;
  }
  return pos;
}

function getTopLevelBlockPosFromDom(editor: Editor, el: HTMLElement): number | null {
  try {
    const domPos = editor.view.posAtDOM(el, 0);
    const resolved = editor.state.doc.resolve(Math.max(0, Math.min(editor.state.doc.content.size, domPos)));
    const index = resolved.index(0);
    if (index < 0 || index >= editor.state.doc.childCount) return null;
    return getChildPos(editor.state.doc, 0, index);
  } catch {
    return null;
  }
}

function getTopLevelIndexFromPos(doc: any, pos: number): number | null {
  let cursor = 0;
  for (let i = 0; i < doc.childCount; i += 1) {
    if (cursor === pos) return i;
    cursor += doc.child(i).nodeSize;
  }
  return null;
}

function findTopLevelBlockAtPoint(root: HTMLElement, x: number, y: number): HTMLElement | null {
  const elements = document.elementsFromPoint(x, y);
  for (const element of elements) {
    if (!(element instanceof HTMLElement)) continue;

    let current: HTMLElement | null = element;
    while (current && current !== root) {
      if (current.parentElement === root) {
        return current;
      }
      current = current.parentElement;
    }
  }
  return null;
}

function normalizeTopLevelIndices(indices: number[], maxExclusive: number): number[] {
  const unique = Array.from(new Set(indices.filter((index) => index >= 0 && index < maxExclusive)));
  unique.sort((a, b) => a - b);
  return unique;
}

function moveBlocksToInsertIndex(editor: Editor, sourceIndices: number[], targetInsertIndex: number): number[] | null {
  const { state } = editor;
  const doc = state.doc;
  const normalizedSource = normalizeTopLevelIndices(sourceIndices, doc.childCount);
  if (normalizedSource.length === 0) return null;

  const boundedTarget = Math.max(0, Math.min(doc.childCount, targetInsertIndex));
  const firstSource = normalizedSource[0];
  const lastSource = normalizedSource[normalizedSource.length - 1];

  if (boundedTarget >= firstSource && boundedTarget <= lastSource + 1) {
    return normalizedSource;
  }

  const movedNodes = normalizedSource.map((sourceIndex) => doc.child(sourceIndex));
  const tr = state.tr;

  for (let idx = normalizedSource.length - 1; idx >= 0; idx -= 1) {
    const sourceIndex = normalizedSource[idx];
    if (sourceIndex >= tr.doc.childCount) continue;
    const sourcePos = getChildPos(tr.doc, 0, sourceIndex);
    const sourceNode = tr.doc.child(sourceIndex);
    tr.delete(sourcePos, sourcePos + sourceNode.nodeSize);
  }

  const removedBeforeTarget = normalizedSource.filter((sourceIndex) => sourceIndex < boundedTarget).length;
  const safeInsertIndex = Math.max(0, Math.min(tr.doc.childCount, boundedTarget - removedBeforeTarget));
  const insertPos = getChildPos(tr.doc, 0, safeInsertIndex);
  tr.insert(insertPos, Fragment.fromArray(movedNodes));

  const nextIndices = movedNodes.map((_, offset) => safeInsertIndex + offset);
  if (nextIndices.length > 0) {
    const nextPos = getChildPos(tr.doc, 0, nextIndices[0]);
    const movedNode = tr.doc.child(nextIndices[0]);
    if (movedNode?.type?.spec?.selectable) {
      tr.setSelection(NodeSelection.create(tr.doc, nextPos));
    } else {
      tr.setSelection(TextSelection.near(tr.doc.resolve(Math.min(tr.doc.content.size, nextPos + 1))));
    }
  }

  editor.view.dispatch(tr);
  return nextIndices;
}

function tableCellHasUserContent(cellNode: any): boolean {
  if (!cellNode) return false;
  if (String(cellNode.textContent || "").trim().length > 0) return true;

  let hasNonTextLeaf = false;
  cellNode.descendants((descendant: any) => {
    if (descendant.isText) return true;
    if (descendant.type?.name === "hardBreak") return true;
    if (descendant.isLeaf) {
      hasNonTextLeaf = true;
      return false;
    }
    return true;
  });

  return hasNonTextLeaf;
}

function tableColumnHasUserContent(tableNode: any, columnIndex: number): boolean {
  if (!tableNode || tableNode.type?.name !== "table") return false;
  if (columnIndex < 0) return false;

  for (let rowIndex = 0; rowIndex < tableNode.childCount; rowIndex += 1) {
    const rowNode = tableNode.child(rowIndex);
    if (!rowNode || rowNode.childCount === 0) continue;
    if (columnIndex >= rowNode.childCount) continue;
    if (tableCellHasUserContent(rowNode.child(columnIndex))) {
      return true;
    }
  }

  return false;
}

function getTableRightmostCellLocation(tableNode: any): { rowIndex: number; columnIndex: number } | null {
  if (!tableNode || tableNode.type?.name !== "table" || tableNode.childCount === 0) return null;

  let targetRowIndex = -1;
  let maxColumns = 0;

  for (let rowIndex = 0; rowIndex < tableNode.childCount; rowIndex += 1) {
    const rowNode = tableNode.child(rowIndex);
    const columnCount = rowNode?.childCount || 0;
    if (columnCount > maxColumns) {
      maxColumns = columnCount;
      targetRowIndex = rowIndex;
    }
  }

  if (targetRowIndex < 0 || maxColumns <= 0) return null;

  return {
    rowIndex: targetRowIndex,
    columnIndex: maxColumns - 1,
  };
}

const SLASH_COMMANDS: SlashCommand[] = [
  {
    id: "text",
    title: "Text",
    description: "Plain paragraph",
    group: "text",
    keywords: ["paragraph", "normal", "p"],
    icon: Text,
    run: (editor) => editor.chain().focus().setParagraph().run(),
  },
  {
    id: "h1",
    title: "Heading 1",
    description: "Large section heading",
    group: "text",
    keywords: ["h1", "title", "heading"],
    icon: Heading1,
    run: (editor) => applyHeadingLevel(editor, 1),
  },
  {
    id: "h2",
    title: "Heading 2",
    description: "Medium section heading",
    group: "text",
    keywords: ["h2", "subheading", "heading"],
    icon: Heading2,
    run: (editor) => applyHeadingLevel(editor, 2),
  },
  {
    id: "h3",
    title: "Heading 3",
    description: "Small section heading",
    group: "text",
    keywords: ["h3", "heading"],
    icon: Heading3,
    run: (editor) => applyHeadingLevel(editor, 3),
  },
  {
    id: "quote",
    title: "Quote",
    description: "Quoted callout block",
    group: "text",
    keywords: ["quote", "blockquote", "callout"],
    icon: Quote,
    run: (editor) => editor.chain().focus().toggleBlockquote().run(),
  },
  {
    id: "callout",
    title: "Callout",
    description: "Highlighted note or warning",
    group: "layout",
    keywords: ["callout", "tip", "note", "warning"],
    icon: Lightbulb,
    run: (editor) => {
      editor.chain().focus().insertContent({
        type: "callout",
        attrs: { tone: "tip", emoji: "💡" },
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: "Tip: Review content tone before publishing" }],
          },
        ],
      }).run();
    },
  },
  {
    id: "bullet-list",
    title: "Bullet List",
    description: "Unordered list",
    group: "lists",
    keywords: ["list", "bullet", "ul"],
    icon: List,
    run: (editor) => editor.chain().focus().toggleBulletList().run(),
  },
  {
    id: "number-list",
    title: "Numbered List",
    description: "Ordered list",
    group: "lists",
    keywords: ["list", "number", "ordered", "ol"],
    icon: ListOrdered,
    run: (editor) => editor.chain().focus().toggleOrderedList().run(),
  },
  {
    id: "check-list",
    title: "Checklist",
    description: "Track tasks",
    group: "lists",
    keywords: ["task", "todo", "checklist"],
    icon: CheckSquare,
    run: (editor) => editor.chain().focus().toggleTaskList().run(),
  },
  {
    id: "divider",
    title: "Divider",
    description: "Horizontal rule",
    group: "layout",
    keywords: ["divider", "line", "hr", "separator"],
    icon: Minus,
    run: (editor) => editor.chain().focus().setHorizontalRule().run(),
  },
  {
    id: "table",
    title: "Table",
    description: "3 x 3 table",
    group: "layout",
    keywords: ["table", "grid"],
    icon: TableIcon,
    run: (editor) => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: false }).run(),
  },
  {
    id: "link",
    title: "Link",
    description: "Add or edit a URL",
    group: "media",
    keywords: ["url", "hyperlink", "reference"],
    icon: LinkIcon,
    run: (editor) => {
      const previous = editor.getAttributes("link").href as string | undefined;
      const url = window.prompt("Link URL", previous || "https://");
      if (url === null) return;
      const trimmed = url.trim();
      if (!trimmed) {
        editor.chain().focus().extendMarkRange("link").unsetLink().run();
        return;
      }
      editor.chain().focus().extendMarkRange("link").setLink({ href: trimmed }).run();
    },
  },
  {
    id: "code-block",
    title: "Code Block",
    description: "Multiline code snippet",
    group: "advanced",
    keywords: ["code", "snippet", "pre"],
    icon: Code,
    run: (editor) => editor.chain().focus().toggleCodeBlock().run(),
  },
  {
    id: "inline-code",
    title: "Inline Code",
    description: "Monospace code text",
    group: "advanced",
    keywords: ["inline", "code", "mark"],
    icon: Code,
    run: (editor) => editor.chain().focus().toggleCode().run(),
  },
  {
    id: "clear-formatting",
    title: "Clear Formatting",
    description: "Reset marks and block style",
    group: "advanced",
    keywords: ["reset", "plain", "remove style"],
    icon: Text,
    run: (editor) => editor.chain().focus().unsetAllMarks().clearNodes().run(),
  },
];

const SLASH_GROUP_META: Record<SlashGroup, { label: string; icon: React.ComponentType<{ className?: string }> }> = {
  text: { label: "Text", icon: Text },
  lists: { label: "Lists", icon: List },
  layout: { label: "Layout", icon: TableIcon },
  media: { label: "Media", icon: LinkIcon },
  advanced: { label: "Advanced", icon: Code },
};

const SLASH_GROUP_ORDER: SlashGroup[] = ["text", "lists", "layout", "media", "advanced"];

const BLOCK_TEXT_COLORS: BlockColorOption[] = [
  { id: "default", label: "Default text", color: null, swatch: "#4b5563" },
  { id: "gray", label: "Gray text", color: "#6b7280", swatch: "#6b7280" },
  { id: "brown", label: "Brown text", color: "#9a6f49", swatch: "#9a6f49" },
  { id: "orange", label: "Orange text", color: "#c96d2d", swatch: "#c96d2d" },
  { id: "yellow", label: "Yellow text", color: "#b38b17", swatch: "#b38b17" },
  { id: "green", label: "Green text", color: "#2f8f63", swatch: "#2f8f63" },
  { id: "blue", label: "Blue text", color: "#3178c6", swatch: "#3178c6" },
  { id: "purple", label: "Purple text", color: "#7a53c5", swatch: "#7a53c5" },
  { id: "pink", label: "Pink text", color: "#c7548a", swatch: "#c7548a" },
  { id: "red", label: "Red text", color: "#c84d4d", swatch: "#c84d4d" },
];

const BLOCK_BACKGROUND_COLORS: BlockColorOption[] = [
  { id: "default", label: "Default background", color: null, swatch: "#ffffff" },
  { id: "gray", label: "Gray background", color: "#f3f4f6", swatch: "#f3f4f6" },
  { id: "brown", label: "Brown background", color: "#f4ede7", swatch: "#f4ede7" },
  { id: "orange", label: "Orange background", color: "#fef1e7", swatch: "#fef1e7" },
  { id: "yellow", label: "Yellow background", color: "#fdf8d9", swatch: "#fdf8d9" },
  { id: "green", label: "Green background", color: "#e9f6ee", swatch: "#e9f6ee" },
  { id: "blue", label: "Blue background", color: "#e9f2ff", swatch: "#e9f2ff" },
  { id: "purple", label: "Purple background", color: "#f1ecff", swatch: "#f1ecff" },
  { id: "pink", label: "Pink background", color: "#fcecf4", swatch: "#fcecf4" },
  { id: "red", label: "Red background", color: "#fdecec", swatch: "#fdecec" },
];

function getSlashContext(editor: Editor): SlashContext | null {
  const { state } = editor;
  const { from, empty } = state.selection;
  if (!empty) return null;

  const resolved = state.doc.resolve(from);
  const parent = resolved.parent;
  if (!parent?.isTextblock) return null;

  const textBefore = parent.textBetween(0, resolved.parentOffset, "\0", "\0");
  if (!textBefore) return null;

  const slashIndex = textBefore.lastIndexOf("/");
  if (slashIndex < 0) return null;

  if (slashIndex > 0) {
    const charBeforeSlash = textBefore[slashIndex - 1];
    if (!/\s/.test(charBeforeSlash)) return null;
  }

  const rawQuery = textBefore.slice(slashIndex + 1);
  const query = rawQuery.replace(/^\s+/, "");

  const fromPos = from - (textBefore.length - slashIndex);
  return {
    from: fromPos,
    to: from,
    query,
  };
}

const DEFAULT_DOC: TipTapEditorValue = {
  type: "doc",
  content: [
    {
      type: "heading",
      attrs: { level: 1 },
      content: [{ type: "text", text: "Untitled" }],
    },
    {
      type: "paragraph",
      content: [
        {
          type: "text",
          text: "Start writing. Use the toolbar for headings, checklists, tables, and more.",
        },
      ],
    },
  ],
};

export function TipTapEditor({
  value,
  onChange,
  onEditorReady,
  placeholder = "Write something...",
  className,
  editable = true,
  showToolbar = true,
  showBubbleMenu = true,
  stickyToolbar = true,
  toolbarStickyOffset = 88,
}: Props) {
  const lastExternalValueRef = React.useRef<string | null>(null);
  const editorShellRef = React.useRef<HTMLDivElement | null>(null);

  const [slashOpen, setSlashOpen] = React.useState(false);
  const [slashQuery, setSlashQuery] = React.useState("");
  const [slashPosition, setSlashPosition] = React.useState<{ top: number; left: number; listMaxHeight: number }>({
    top: 0,
    left: 0,
    listMaxHeight: 288,
  });
  const [slashRange, setSlashRange] = React.useState<{ from: number; to: number } | null>(null);
  const [slashSelectedIndex, setSlashSelectedIndex] = React.useState(0);
  const [recentSlashIds, setRecentSlashIds] = React.useState<string[]>([]);
  const [hoverBlock, setHoverBlock] = React.useState<HoverBlockState | null>(null);
  const [hoverMenuOpen, setHoverMenuOpen] = React.useState(false);
  const [hoverColorPanel, setHoverColorPanel] = React.useState<"text" | "background" | null>(null);
  const [hoverTableCell, setHoverTableCell] = React.useState<HoverTableCellState | null>(null);
  const [tableQuickMenu, setTableQuickMenu] = React.useState<"row" | "column" | null>(null);
  const [isHoveringTableBottomBuffer, setIsHoveringTableBottomBuffer] = React.useState(false);
  const [isDraggingBlock, setIsDraggingBlock] = React.useState(false);
  const [selectedBlockIndices, setSelectedBlockIndices] = React.useState<number[]>([]);
  const hoverBlockElementRef = React.useRef<HTMLElement | null>(null);
  const selectedBlockElementsRef = React.useRef<Set<HTMLElement>>(new Set());
  const hoverBlockRef = React.useRef<HoverBlockState | null>(null);
  const selectedBlockIndicesRef = React.useRef<number[]>([]);
  const blockSelectionAnchorRef = React.useRef<number | null>(null);
  const pendingHoverClearRef = React.useRef<number | null>(null);
  const hoverMenuOpenRef = React.useRef(false);
  const hoverColorPanelRef = React.useRef<"text" | "background" | null>(null);
  const hoverUiInteractingRef = React.useRef(false);

  // Diff manager integration (optional - will be null if not wrapped in provider)
  let diffManager: ReturnType<typeof useDiffManager> | null = null;
  try {
    diffManager = useDiffManager();
  } catch {
    // Not wrapped in DiffManagerProvider - that's okay
  }

  const toolbarStickyStyle = React.useMemo<React.CSSProperties | undefined>(() => {
    if (!stickyToolbar) return undefined;
    return {
      ["--editor-toolbar-sticky-top" as any]: `${Math.max(0, Number(toolbarStickyOffset) || 0)}px`,
    };
  }, [stickyToolbar, toolbarStickyOffset]);

  // Create a ref to store active diffs so the extension always has access to the latest state
  const activeDiffsRef = React.useRef<Map<string, any>>(new Map());

  // Ref for diffManager so extension callbacks always access the latest value (avoids stale closure)
  const diffManagerRef = React.useRef(diffManager);
  React.useEffect(() => {
    diffManagerRef.current = diffManager;
  }, [diffManager]);

  const editor = useEditor({
    // Next.js renders client components on the server for the initial HTML.
    // TipTap recommends disabling immediate render to avoid hydration mismatches.
    immediatelyRender: false,
    editable,
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        horizontalRule: false,
      }),
      DividerBlock,
      CalloutBlock,
      Underline,
      TextStyle,
      Color.configure({ types: ["textStyle"] }),
      Highlight.configure({ multicolor: true }),
      Link.configure({
        openOnClick: false,
        autolink: true,
        linkOnPaste: true,
      }),
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      TaskList,
      TaskItem.configure({ nested: true }),
      DraggableTable.configure({
        resizable: true,
        allowTableNodeSelection: true,
      }),
      TableRow,
      TableHeader,
      TableCell,
      Placeholder.configure({
        placeholder,
      }),
      DiffMarksExtension.configure({
        getActiveDiffs: () => activeDiffsRef.current,
        onAccept: (diffId) => {
          console.log("[TipTap] onAccept called with diffId:", diffId);
          const dm = diffManagerRef.current;
          console.log("[TipTap] diffManager (from ref) exists:", !!dm);
          if (dm) {
            dm.acceptDiff(diffId);
            // After accept, schedule ref update and decoration refresh
            setTimeout(() => {
              if (diffManagerRef.current) {
                activeDiffsRef.current = diffManagerRef.current.activeDiffs;
                console.log("[TipTap] Updated ref after accept, active diffs:", activeDiffsRef.current.size);
              }
            }, 50);
          }
        },
        onReject: (diffId) => {
          console.log("[TipTap] onReject called with diffId:", diffId);
          const dm = diffManagerRef.current;
          if (dm) {
            dm.rejectDiff(diffId);
            // After reject, schedule ref update and decoration refresh
            setTimeout(() => {
              if (diffManagerRef.current) {
                activeDiffsRef.current = diffManagerRef.current.activeDiffs;
                console.log("[TipTap] Updated ref after reject, active diffs:", activeDiffsRef.current.size);
              }
            }, 50);
          }
        },
      }),
    ],
    content: value ?? DEFAULT_DOC,
    editorProps: {
      attributes: {
        class: "tiptap-editor focus:outline-none max-w-none prose prose-headings:font-display font-default",
        spellcheck: "true",
      },
    },
    onUpdate: ({ editor }) => {
      onChange?.(editor.getJSON());
    },
    onCreate: ({ editor }) => {
      onEditorReady?.(editor);
    },
  });

  // Update ref when diffManager changes
  React.useEffect(() => {
    if (diffManager) {
      console.log("[TipTap] Diff state changed, updating decorations. Active diffs:", diffManager.activeDiffs.size, "renderVersion:", diffManager.renderVersion);
      activeDiffsRef.current = diffManager.activeDiffs;

      // Force editor update to refresh decorations
      if (editor && !editor.isDestroyed) {
        // Dispatching a transaction explicitly triggers decoration updates
        editor.view.dispatch(editor.state.tr.setMeta("diffUpdate", true));
      }
    }
  }, [diffManager, editor]);

  React.useEffect(() => {
    if (!editor) return;
    onEditorReady?.(editor);
  }, [editor, onEditorReady]);

  // TipTap doesn't always pick up editable changes from React props,
  // so explicitly apply the current editable flag.
  React.useEffect(() => {
    if (!editor) return;
    editor.setEditable(Boolean(editable));
  }, [editor, editable]);

  // Allow external value updates (e.g., load template) without breaking typing.
  React.useEffect(() => {
    if (!editor) return;
    if (!value) return;

    const next = JSON.stringify(value);
    if (lastExternalValueRef.current === next) return;
    lastExternalValueRef.current = next;

    // Avoid resetting selection/history when content is effectively the same.
    const current = JSON.stringify(editor.getJSON());
    if (current === next) return;

    editor.commands.setContent(value, { emitUpdate: false });
  }, [editor, value]);

  const closeSlashMenu = React.useCallback(() => {
    setSlashOpen(false);
    setSlashQuery("");
    setSlashRange(null);
    setSlashSelectedIndex(0);
  }, []);

  const slashCommandById = React.useMemo(() => {
    const map = new Map<string, SlashCommand>();
    for (const command of SLASH_COMMANDS) {
      map.set(command.id, command);
    }
    return map;
  }, []);

  React.useEffect(() => {
    try {
      const raw = window.localStorage.getItem(SLASH_RECENTS_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return;

      const cleaned = parsed
        .map((v) => String(v || "").trim())
        .filter((v) => v && slashCommandById.has(v));
      setRecentSlashIds(cleaned.slice(0, SLASH_RECENTS_LIMIT));
    } catch {
      // ignore malformed local storage
    }
  }, [slashCommandById]);

  const rememberSlashCommand = React.useCallback((commandId: string) => {
    setRecentSlashIds((prev) => {
      const next = [commandId, ...prev.filter((id) => id !== commandId)].slice(0, SLASH_RECENTS_LIMIT);
      try {
        window.localStorage.setItem(SLASH_RECENTS_KEY, JSON.stringify(next));
      } catch {
        // ignore storage write failures
      }
      return next;
    });
  }, []);

  const slashSections = React.useMemo<SlashSection[]>(() => {
    const createGroupedSections = (commands: SlashCommand[]) => {
      return SLASH_GROUP_ORDER
        .map((group) => ({
          id: group,
          label: SLASH_GROUP_META[group].label,
          icon: SLASH_GROUP_META[group].icon,
          commands: commands.filter((command) => command.group === group),
        }))
        .filter((section) => section.commands.length > 0);
    };

    const q = slashQuery.trim().toLowerCase();
    if (q) {
      const filtered = SLASH_COMMANDS.filter((command) => {
        if (command.title.toLowerCase().includes(q)) return true;
        if (command.description.toLowerCase().includes(q)) return true;
        return command.keywords.some((k) => k.toLowerCase().includes(q));
      });
      return createGroupedSections(filtered);
    }

    const recents = recentSlashIds
      .map((id) => slashCommandById.get(id))
      .filter((cmd): cmd is SlashCommand => Boolean(cmd));
    const recentIds = new Set(recents.map((command) => command.id));
    const remaining = SLASH_COMMANDS.filter((command) => !recentIds.has(command.id));

    const sections: SlashSection[] = [];
    if (recents.length > 0) {
      sections.push({ id: "recent", label: "Recent", icon: History, commands: recents });
    }

    return [...sections, ...createGroupedSections(remaining)];
  }, [recentSlashIds, slashCommandById, slashQuery]);

  const slashMenuItems = React.useMemo(
    () => slashSections.flatMap((section) => section.commands),
    [slashSections]
  );

  const slashIndexById = React.useMemo(() => {
    const map = new Map<string, number>();
    slashMenuItems.forEach((command, index) => {
      map.set(command.id, index);
    });
    return map;
  }, [slashMenuItems]);

  const selectedSlashCommandId = slashMenuItems[slashSelectedIndex]?.id || null;

  const runSlashCommand = React.useCallback((command: SlashCommand) => {
    if (!editor) return;
    const context = slashRange ?? getSlashContext(editor);
    editor.chain().focus().deleteRange(context || { from: editor.state.selection.from, to: editor.state.selection.from }).run();
    command.run(editor);
    rememberSlashCommand(command.id);
    closeSlashMenu();
  }, [closeSlashMenu, editor, rememberSlashCommand, slashRange]);

  React.useEffect(() => {
    if (!editor || !editable) {
      closeSlashMenu();
      return;
    }

    const updateSlashMenu = () => {
      const context = getSlashContext(editor);
      if (!context) {
        closeSlashMenu();
        return;
      }

      const shell = editorShellRef.current;
      if (!shell) {
        closeSlashMenu();
        return;
      }

      const coords = editor.view.coordsAtPos(context.to);
      const menuWidth = 360;
      const menuHeaderHeight = 54;
      const viewportPadding = 10;
      const menuGap = 8;

      const left = Math.max(
        viewportPadding,
        Math.min(coords.left, window.innerWidth - menuWidth - viewportPadding)
      );

      const spaceBelow = window.innerHeight - coords.bottom - viewportPadding;
      const spaceAbove = coords.top - viewportPadding;
      const openAbove = spaceBelow < 220 && spaceAbove > spaceBelow;

      const availableVertical = Math.max(
        140,
        (openAbove ? spaceAbove : spaceBelow) - menuHeaderHeight - menuGap
      );
      const listMaxHeight = Math.min(320, availableVertical);

      const menuHeight = menuHeaderHeight + listMaxHeight;
      const top = openAbove
        ? Math.max(viewportPadding, coords.top - menuHeight - menuGap)
        : Math.max(viewportPadding, Math.min(coords.bottom + menuGap, window.innerHeight - menuHeight - viewportPadding));

      setSlashRange({ from: context.from, to: context.to });
      setSlashQuery(context.query);
      setSlashPosition({ top, left, listMaxHeight });
      setSlashOpen(true);
    };

    const handleEditorBlur = () => {
      window.setTimeout(() => {
        const shell = editorShellRef.current;
        const activeEl = document.activeElement;
        if (shell && activeEl && shell.contains(activeEl)) return;
        closeSlashMenu();
      }, 0);
    };

    updateSlashMenu();
    editor.on("selectionUpdate", updateSlashMenu);
    editor.on("transaction", updateSlashMenu);
    editor.on("blur", handleEditorBlur);
    window.addEventListener("scroll", updateSlashMenu, true);
    window.addEventListener("resize", updateSlashMenu);

    return () => {
      editor.off("selectionUpdate", updateSlashMenu);
      editor.off("transaction", updateSlashMenu);
      editor.off("blur", handleEditorBlur);
      window.removeEventListener("scroll", updateSlashMenu, true);
      window.removeEventListener("resize", updateSlashMenu);
    };
  }, [closeSlashMenu, editable, editor]);

  React.useEffect(() => {
    setSlashSelectedIndex(0);
  }, [slashQuery]);

  React.useEffect(() => {
    if (!slashOpen) return;
    setSlashSelectedIndex((prev) => Math.min(prev, Math.max(0, slashMenuItems.length - 1)));
  }, [slashMenuItems.length, slashOpen]);

  React.useEffect(() => {
    if (!editor || !slashOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setSlashSelectedIndex((prev) => (slashMenuItems.length ? (prev + 1) % slashMenuItems.length : 0));
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setSlashSelectedIndex((prev) => {
          if (!slashMenuItems.length) return 0;
          return (prev - 1 + slashMenuItems.length) % slashMenuItems.length;
        });
        return;
      }
      if (event.key === "Enter") {
        if (!slashMenuItems.length) return;
        event.preventDefault();
        const command = slashMenuItems[slashSelectedIndex] || slashMenuItems[0];
        if (command) runSlashCommand(command);
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        closeSlashMenu();
      }
    };

    const dom = editor.view.dom;
    dom.addEventListener("keydown", handleKeyDown);
    return () => dom.removeEventListener("keydown", handleKeyDown);
  }, [closeSlashMenu, editor, runSlashCommand, slashMenuItems, slashOpen, slashSelectedIndex]);

  const clearHoverBlock = React.useCallback(() => {
    if (hoverBlockElementRef.current) {
      hoverBlockElementRef.current.classList.remove("editor-hover-block");
      hoverBlockElementRef.current = null;
    }
    setHoverBlock(null);
    setHoverTableCell(null);
    setIsHoveringTableBottomBuffer(false);
    setHoverMenuOpen(false);
    setHoverColorPanel(null);
  }, []);

  React.useEffect(() => {
    hoverMenuOpenRef.current = hoverMenuOpen;
  }, [hoverMenuOpen]);

  React.useEffect(() => {
    if (hoverMenuOpen) return;
    setHoverColorPanel(null);
  }, [hoverMenuOpen]);

  React.useEffect(() => {
    if (!hoverMenuOpen) return;
    setTableQuickMenu(null);
  }, [hoverMenuOpen]);

  React.useEffect(() => {
    if (!tableQuickMenu) return;

    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest("[data-editor-block-ui='true']")) return;
      setTableQuickMenu(null);
    };

    window.addEventListener("mousedown", onPointerDown, true);
    return () => window.removeEventListener("mousedown", onPointerDown, true);
  }, [tableQuickMenu]);

  React.useEffect(() => {
    if (hoverBlock?.nodeType === "table") return;
    setTableQuickMenu(null);
  }, [hoverBlock]);

  React.useEffect(() => {
    if (hoverTableCell) return;
    setTableQuickMenu(null);
  }, [hoverTableCell]);

  React.useEffect(() => {
    hoverColorPanelRef.current = hoverColorPanel;
  }, [hoverColorPanel]);

  React.useEffect(() => {
    hoverBlockRef.current = hoverBlock;
  }, [hoverBlock]);

  React.useEffect(() => {
    const el = hoverBlockElementRef.current;
    if (!el) return;

    // Keep the bottom footer "Add row" control visible while the cursor
    // is within the extended Notion-like bottom hover buffer for tables.
    if (hoverBlock?.nodeType === "table" && isHoveringTableBottomBuffer) {
      el.classList.add("editor-table-bottom-buffer-active");
      return () => {
        el.classList.remove("editor-table-bottom-buffer-active");
      };
    }

    el.classList.remove("editor-table-bottom-buffer-active");
  }, [hoverBlock, isHoveringTableBottomBuffer]);

  React.useEffect(() => {
    if (hoverBlock?.nodeType === "table") return;
    setIsHoveringTableBottomBuffer(false);
  }, [hoverBlock]);

  React.useEffect(() => {
    selectedBlockIndicesRef.current = selectedBlockIndices;
  }, [selectedBlockIndices]);

  const syncSelectedBlockClasses = React.useCallback((indices: number[]) => {
    if (!editor) return;
    const root = editor.view.dom as HTMLElement;
    const normalized = normalizeTopLevelIndices(indices, root.children.length);
    const nextElements = new Set<HTMLElement>();

    normalized.forEach((index) => {
      const blockEl = root.children.item(index);
      if (!(blockEl instanceof HTMLElement)) return;
      blockEl.classList.add("editor-selected-block");
      nextElements.add(blockEl);
    });

    selectedBlockElementsRef.current.forEach((prevEl) => {
      if (nextElements.has(prevEl)) return;
      prevEl.classList.remove("editor-selected-block");
    });

    selectedBlockElementsRef.current = nextElements;
  }, [editor]);

  const clearBlockSelection = React.useCallback(() => {
    selectedBlockElementsRef.current.forEach((el) => {
      el.classList.remove("editor-selected-block");
    });
    selectedBlockElementsRef.current.clear();
    selectedBlockIndicesRef.current = [];
    blockSelectionAnchorRef.current = null;
    setSelectedBlockIndices([]);
  }, []);

  React.useEffect(() => {
    syncSelectedBlockClasses(selectedBlockIndices);
  }, [selectedBlockIndices, syncSelectedBlockClasses]);

  React.useEffect(() => {
    if (!editor) return;

    const syncFromRef = () => {
      syncSelectedBlockClasses(selectedBlockIndicesRef.current);
    };

    editor.on("transaction", syncFromRef);
    window.addEventListener("resize", syncFromRef);

    return () => {
      editor.off("transaction", syncFromRef);
      window.removeEventListener("resize", syncFromRef);
      selectedBlockElementsRef.current.forEach((el) => {
        el.classList.remove("editor-selected-block");
      });
      selectedBlockElementsRef.current.clear();
    };
  }, [editor, syncSelectedBlockClasses]);

  const cancelScheduledHoverClear = React.useCallback(() => {
    if (pendingHoverClearRef.current !== null) {
      window.clearTimeout(pendingHoverClearRef.current);
      pendingHoverClearRef.current = null;
    }
  }, []);

  const scheduleHoverClear = React.useCallback(() => {
    cancelScheduledHoverClear();
    const activeHover = hoverBlockRef.current;
    const clearDelay = activeHover?.nodeType === "table" ? 1400 : 700;
    pendingHoverClearRef.current = window.setTimeout(() => {
      pendingHoverClearRef.current = null;
      if (hoverUiInteractingRef.current) return;
      if (hoverMenuOpenRef.current) return;
      clearHoverBlock();
    }, clearDelay);
  }, [cancelScheduledHoverClear, clearHoverBlock]);

  const onHoverUiEnter = React.useCallback(() => {
    hoverUiInteractingRef.current = true;
    cancelScheduledHoverClear();
  }, [cancelScheduledHoverClear]);

  const onHoverUiLeave = React.useCallback(() => {
    hoverUiInteractingRef.current = false;
    if (!hoverMenuOpenRef.current) {
      scheduleHoverClear();
    }
  }, [scheduleHoverClear]);

  React.useEffect(() => {
    return () => {
      if (pendingHoverClearRef.current !== null) {
        window.clearTimeout(pendingHoverClearRef.current);
        pendingHoverClearRef.current = null;
      }
    };
  }, []);

  const setHoverFromElement = React.useCallback((el: HTMLElement | null, options?: { keepMenuOpen?: boolean }) => {
    if (!editor || !editable) {
      clearHoverBlock();
      return;
    }

    const shell = editorShellRef.current;
    if (!shell || !el) {
      if (hoverMenuOpenRef.current) return;
      clearHoverBlock();
      return;
    }

    const blockPos = getTopLevelBlockPosFromDom(editor, el);
    if (blockPos === null) {
      if (hoverMenuOpenRef.current) return;
      clearHoverBlock();
      return;
    }

    if (hoverBlockElementRef.current !== el) {
      if (hoverBlockElementRef.current) {
        hoverBlockElementRef.current.classList.remove("editor-hover-block");
      }
      hoverBlockElementRef.current = el;
      hoverBlockElementRef.current.classList.add("editor-hover-block");
    }

    const node = editor.state.doc.nodeAt(blockPos);
    const nodeType = String(node?.type?.name || "paragraph");
    const shellRect = shell.getBoundingClientRect();
    const blockRect = el.getBoundingClientRect();
    const next: HoverBlockState = {
      pos: blockPos,
      nodeType,
      top: blockRect.top - shellRect.top,
      left: blockRect.left - shellRect.left,
      bottom: blockRect.bottom - shellRect.top,
      right: blockRect.right - shellRect.left,
      width: blockRect.width,
    };

    setHoverBlock((prev) => {
      const changedBlock = !prev || prev.pos !== next.pos;
      if (changedBlock && !options?.keepMenuOpen && !hoverColorPanelRef.current) {
        setHoverMenuOpen(false);
      }
      if (
        prev
        && prev.pos === next.pos
        && Math.round(prev.top) === Math.round(next.top)
        && Math.round(prev.left) === Math.round(next.left)
        && Math.round(prev.bottom) === Math.round(next.bottom)
        && Math.round(prev.right) === Math.round(next.right)
        && prev.nodeType === next.nodeType
      ) {
        return prev;
      }
      return next;
    });
  }, [clearHoverBlock, editable, editor]);

  React.useEffect(() => {
    if (!editor || !editable) {
      clearHoverBlock();
      return;
    }

    const root = editor.view.dom as HTMLElement;
    const shell = editorShellRef.current;
    if (!shell) {
      clearHoverBlock();
      return;
    }

    const findTopLevelBlock = (target: EventTarget | null): HTMLElement | null => {
      let current = target instanceof HTMLElement ? target : null;
      while (current && current !== root) {
        if (current.parentElement === root) {
          return current;
        }
        current = current.parentElement;
      }
      return null;
    };

    const findTableCell = (target: EventTarget | null): HTMLElement | null => {
      if (!(target instanceof HTMLElement)) return null;
      const cell = target.closest("td,th");
      return cell instanceof HTMLElement ? cell : null;
    };

    const isTableBlockElement = (el: HTMLElement): boolean => {
      if (el.classList.contains("tableWrapper")) return true;
      return Boolean(el.querySelector("table"));
    };

    const getTableHoverMetrics = (tableEl: HTMLElement) => {
      const domTable = tableEl.querySelector("table");
      const tableBody = domTable instanceof HTMLElement ? domTable : tableEl;
      const tableRect = tableBody.getBoundingClientRect();
      const firstRow = tableBody.querySelector("tr");
      const firstCell = tableBody.querySelector("tr:first-child > th, tr:first-child > td");
      const rowRect = firstRow instanceof HTMLElement ? firstRow.getBoundingClientRect() : null;
      const cellRect = firstCell instanceof HTMLElement ? firstCell.getBoundingClientRect() : null;

      const cellHeight = Math.max(24, Math.round(cellRect?.height || rowRect?.height || 34));
      const cellWidth = Math.max(48, Math.round(cellRect?.width || 120));
      const bottomHoverHeight = Math.max(24, Math.min(72, cellHeight));
      const bottomBuffer = bottomHoverHeight + Math.max(12, Math.round(bottomHoverHeight * 0.45));
      const bottomControlWidth = Math.max(92, Math.min(tableRect.width, Math.round(cellWidth * 2)));
      const bottomControlLeft = tableRect.left + Math.max(0, (tableRect.width - bottomControlWidth) / 2);

      return {
        tableRect,
        bottomHoverHeight,
        right: Math.max(52, Math.min(120, Math.round(cellWidth * 0.8))),
        bottomMain: Math.max(18, Math.round(bottomHoverHeight * 0.7)),
        bottomControl: bottomHoverHeight + Math.max(18, Math.round(bottomHoverHeight * 0.85)),
        bottomBuffer,
        bottomControlLeft,
        bottomControlRight: bottomControlLeft + bottomControlWidth,
      };
    };

    const isWithinTableBottomFooterZone = (
      x: number,
      y: number,
      metrics: ReturnType<typeof getTableHoverMetrics>
    ) => (
      x >= metrics.tableRect.left - 72
      && x <= metrics.tableRect.right + 72
      && y >= metrics.tableRect.bottom - metrics.bottomHoverHeight
      && y <= metrics.tableRect.bottom + metrics.bottomBuffer + 16
    );

    const isWithinTableMainZone = (
      x: number,
      y: number,
      metrics: ReturnType<typeof getTableHoverMetrics>
    ) => (
      x >= metrics.tableRect.left - 128
      && x <= metrics.tableRect.right + metrics.right
      && y >= metrics.tableRect.top - 30
      && y <= metrics.tableRect.bottom + metrics.bottomMain
    );

    const findNearbyTableBlock = (x: number, y: number): HTMLElement | null => {
      let candidate: { element: HTMLElement; distance: number } | null = null;

      for (const child of Array.from(root.children)) {
        if (!(child instanceof HTMLElement)) continue;
        if (!isTableBlockElement(child)) continue;

        const metrics = getTableHoverMetrics(child);
        const tableRect = metrics.tableRect;
        const withinMainZone = isWithinTableMainZone(x, y, metrics);
        const withinBottomControlZone = (
          x >= metrics.bottomControlLeft
          && x <= metrics.bottomControlRight
          && y >= tableRect.bottom - 4
          && y <= tableRect.bottom + metrics.bottomControl
        );
        const withinBottomFooterZone = isWithinTableBottomFooterZone(x, y, metrics);
        if (!withinMainZone && !withinBottomControlZone && !withinBottomFooterZone) continue;

        const dx = x < tableRect.left ? tableRect.left - x : (x > tableRect.right ? x - tableRect.right : 0);
        const effectiveBottom = withinBottomControlZone
          ? Math.max(tableRect.bottom + metrics.bottomControl, tableRect.bottom + metrics.bottomBuffer)
          : (withinBottomFooterZone ? tableRect.bottom + metrics.bottomBuffer : tableRect.bottom);
        const dy = y < tableRect.top ? tableRect.top - y : (y > effectiveBottom ? y - effectiveBottom : 0);
        const distance = dx + dy;

        if (!candidate || distance < candidate.distance) {
          candidate = { element: child, distance };
        }
      }

      if (!candidate) return null;
      return candidate.element;
    };

    const updateHoverTableCellFromElement = (tableEl: HTMLElement, cellEl: HTMLElement | null) => {
      if (!cellEl || !tableEl.contains(cellEl) || !editorShellRef.current) return;

      try {
        const cellPos = editor.view.posAtDOM(cellEl, 0);
        const shellRect = editorShellRef.current.getBoundingClientRect();
        const cellRect = cellEl.getBoundingClientRect();
        const nextCell: HoverTableCellState = {
          pos: Math.max(0, Math.min(editor.state.doc.content.size, cellPos)),
          top: cellRect.top - shellRect.top,
          left: cellRect.left - shellRect.left,
          bottom: cellRect.bottom - shellRect.top,
          right: cellRect.right - shellRect.left,
        };
        setHoverTableCell((prev) => {
          if (
            prev
            && prev.pos === nextCell.pos
            && Math.round(prev.top) === Math.round(nextCell.top)
            && Math.round(prev.left) === Math.round(nextCell.left)
          ) {
            return prev;
          }
          return nextCell;
        });
      } catch {
        // Ignore invalid table-cell resolution while moving quickly.
      }
    };

    const onMouseMove = (event: MouseEvent) => {
      if (isDraggingBlock) return;
      if ((event.buttons & 1) === 1) return;
      if (hoverMenuOpenRef.current) return;
      cancelScheduledHoverClear();

      const activeHover = hoverBlockRef.current;
      const activeHoverEl = hoverBlockElementRef.current;
      const keepTableHover = Boolean(activeHover?.nodeType === "table" && activeHoverEl);
      const targetEl = event.target instanceof HTMLElement ? event.target : null;
      const isOverFooterUi = Boolean(targetEl?.closest("[data-editor-table-footer-zone='true']"));
      const isOverBlockUi = Boolean(targetEl?.closest("[data-editor-block-ui='true']"));

      // If the pointer is directly over a non-table top-level block, always prefer that.
      // This prevents the extended table hover buffer logic from "stealing" hover
      // from nearby paragraphs/lists, which makes the left gutter controls feel flaky.
      const directBlockEl = findTopLevelBlock(event.target);
      if (directBlockEl && !isTableBlockElement(directBlockEl)) {
        setIsHoveringTableBottomBuffer(false);
        setHoverTableCell(null);
        setHoverFromElement(directBlockEl);
        return;
      }

      if (keepTableHover && activeHoverEl && isOverBlockUi) {
        setIsHoveringTableBottomBuffer((prev) => {
          const next = isOverFooterUi || (prev && !isOverFooterUi);
          return prev === next ? prev : next;
        });
        updateHoverTableCellFromElement(activeHoverEl, findTableCell(event.target));
        return;
      }

      if (keepTableHover && activeHoverEl) {
        const metrics = getTableHoverMetrics(activeHoverEl);
        const tableRect = metrics.tableRect;
        const withinStickyMainZone = isWithinTableMainZone(event.clientX, event.clientY, metrics);
        const withinStickyBottomControlZone = (
          event.clientX >= metrics.bottomControlLeft
          && event.clientX <= metrics.bottomControlRight
          && event.clientY >= tableRect.bottom - 4
          && event.clientY <= tableRect.bottom + metrics.bottomControl
        );
        const withinStickyBottomFooterZone = isWithinTableBottomFooterZone(event.clientX, event.clientY, metrics);

        setIsHoveringTableBottomBuffer((prev) => (
          (() => {
            const next = withinStickyBottomFooterZone || (prev && withinStickyMainZone);
            return prev === next ? prev : next;
          })()
        ));

        if (withinStickyMainZone || withinStickyBottomControlZone || withinStickyBottomFooterZone) {
          updateHoverTableCellFromElement(activeHoverEl, findTableCell(event.target));

          return;
        }
      }

      const nearbyTableBlock = findNearbyTableBlock(event.clientX, event.clientY);
      if (nearbyTableBlock) {
        const nearbyMetrics = getTableHoverMetrics(nearbyTableBlock);
        const withinNearbyMainZone = isWithinTableMainZone(
          event.clientX,
          event.clientY,
          nearbyMetrics
        );
        const withinNearbyBottomFooter = isWithinTableBottomFooterZone(
          event.clientX,
          event.clientY,
          nearbyMetrics
        );
        setIsHoveringTableBottomBuffer((prev) => (
          (() => {
            const next = withinNearbyBottomFooter || (prev && withinNearbyMainZone);
            return prev === next ? prev : next;
          })()
        ));
        setHoverFromElement(nearbyTableBlock);
        updateHoverTableCellFromElement(nearbyTableBlock, findTableCell(event.target));
        return;
      }

      if (keepTableHover && activeHoverEl) {
        const stickyMetrics = getTableHoverMetrics(activeHoverEl);
        const stickyRect = stickyMetrics.tableRect;
        const withinStickyFallbackZone = (
          event.clientX >= stickyRect.left - 220
          && event.clientX <= stickyRect.right + 220
          && event.clientY >= stickyRect.top - 56
          && event.clientY <= stickyRect.bottom + Math.max(140, stickyMetrics.bottomBuffer + 64)
        );

        if (withinStickyFallbackZone) {
          const withinStickyFallbackFooter = (
            event.clientX >= stickyRect.left - 120
            && event.clientX <= stickyRect.right + 120
            && event.clientY >= stickyRect.bottom - stickyMetrics.bottomHoverHeight
            && event.clientY <= stickyRect.bottom + stickyMetrics.bottomBuffer + 28
          );

          setIsHoveringTableBottomBuffer((prev) => {
            const next = withinStickyFallbackFooter || prev;
            return prev === next ? prev : next;
          });
          updateHoverTableCellFromElement(activeHoverEl, findTableCell(event.target));
          return;
        }
      }

      setIsHoveringTableBottomBuffer(false);

      let blockEl = directBlockEl;

      // Notion-like behavior: when the cursor is in the left gutter (outside
      // actual block content), infer the closest block by vertical position so
      // that the plus / drag icons stay usable even without hovering the text.
      if (!blockEl) {
        const rootRect = root.getBoundingClientRect();
        const withinVerticalBand = (
          event.clientY >= rootRect.top - 24
          && event.clientY <= rootRect.bottom + 24
        );
        const withinLeftGutter = (
          event.clientX >= rootRect.left - 72
          && event.clientX <= rootRect.left + 40
        );

        if (withinVerticalBand && withinLeftGutter) {
          const probeX = Math.max(rootRect.left + 4, Math.min(rootRect.right - 4, rootRect.left + 16));
          blockEl = findTopLevelBlockAtPoint(root, probeX, event.clientY);
        }
      }
      setHoverFromElement(blockEl);

      if (!blockEl || !editorShellRef.current) {
        setIsHoveringTableBottomBuffer(false);
        setHoverTableCell(null);
        return;
      }

      if (!isTableBlockElement(blockEl)) {
        setIsHoveringTableBottomBuffer(false);
        setHoverTableCell(null);
        return;
      }

      const blockMetrics = getTableHoverMetrics(blockEl);
      const withinBlockMainZone = isWithinTableMainZone(event.clientX, event.clientY, blockMetrics);
      const withinBottomFooter = isWithinTableBottomFooterZone(event.clientX, event.clientY, blockMetrics);
      setIsHoveringTableBottomBuffer((prev) => {
        const next = withinBottomFooter || (prev && withinBlockMainZone);
        return prev === next ? prev : next;
      });

      const cellEl = findTableCell(event.target);
      if (!cellEl || !blockEl.contains(cellEl)) {
        return;
      }

      updateHoverTableCellFromElement(blockEl, cellEl);
    };

    const onMouseLeave = (event: MouseEvent) => {
      if (isDraggingBlock) return;
      const nextTarget = event.relatedTarget as Node | null;
      if (shell && nextTarget && shell.contains(nextTarget)) return;
      if (hoverUiInteractingRef.current) return;
      const activeHover = hoverBlockRef.current;
      if (activeHover?.nodeType === "table") {
        scheduleHoverClear();
        return;
      }
      setIsHoveringTableBottomBuffer(false);
      scheduleHoverClear();
    };

    const onContextMenu = (event: MouseEvent) => {
      if (isDraggingBlock) return;
      const blockEl = findTopLevelBlock(event.target);
      if (!blockEl) return;
      event.preventDefault();
      cancelScheduledHoverClear();
      setHoverFromElement(blockEl, { keepMenuOpen: true });
      const blockPos = getTopLevelBlockPosFromDom(editor, blockEl);
      if (blockPos !== null) {
        const blockIndex = getTopLevelIndexFromPos(editor.state.doc, blockPos);
        if (blockIndex !== null) {
          blockSelectionAnchorRef.current = blockIndex;
          setSelectedBlockIndices([blockIndex]);
        }
      }
      setHoverMenuOpen(true);
    };

    const onPointerDown = (event: MouseEvent) => {
      if (!(event.target instanceof HTMLElement)) return;
      if (event.target.closest("[data-editor-block-ui='true']")) return;
      if (selectedBlockIndicesRef.current.length === 0 && selectedBlockElementsRef.current.size === 0) return;
      clearBlockSelection();
    };

    const onScrollOrResize = () => {
      if (hoverMenuOpenRef.current) return;
      if (!hoverBlockElementRef.current) return;
      setHoverFromElement(hoverBlockElementRef.current);
    };

    shell.addEventListener("mousemove", onMouseMove);
    shell.addEventListener("mouseleave", onMouseLeave);
    root.addEventListener("contextmenu", onContextMenu);
    root.addEventListener("mousedown", onPointerDown, true);
    window.addEventListener("scroll", onScrollOrResize, true);
    window.addEventListener("resize", onScrollOrResize);

    return () => {
      shell.removeEventListener("mousemove", onMouseMove);
      shell.removeEventListener("mouseleave", onMouseLeave);
      root.removeEventListener("contextmenu", onContextMenu);
      root.removeEventListener("mousedown", onPointerDown, true);
      window.removeEventListener("scroll", onScrollOrResize, true);
      window.removeEventListener("resize", onScrollOrResize);
      cancelScheduledHoverClear();
      clearHoverBlock();
    };
  }, [cancelScheduledHoverClear, clearBlockSelection, clearHoverBlock, editable, editor, isDraggingBlock, scheduleHoverClear, setHoverFromElement]);

  React.useEffect(() => {
    if (!hoverMenuOpen) return;

    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest("[data-editor-block-ui='true']")) return;
      setHoverColorPanel(null);
      setHoverMenuOpen(false);
      hoverUiInteractingRef.current = false;
    };

    window.addEventListener("mousedown", onPointerDown, true);
    return () => window.removeEventListener("mousedown", onPointerDown, true);
  }, [hoverMenuOpen]);

  const ensureHoverTableSelection = React.useCallback(() => {
    if (!editor || !hoverBlock || hoverBlock.nodeType !== "table") return false;

    // Prefer hovered cell so row/column actions target what the user points at,
    // not whichever table cell happened to be focused previously.
    if (hoverTableCell) {
      const probePos = Math.max(0, Math.min(editor.state.doc.content.size, hoverTableCell.pos));
      const $probe = editor.state.doc.resolve(probePos);
      const $cell = cellAround($probe) ?? cellNear($probe);
      if ($cell) {
        let tablePos: number | null = null;
        for (let d = $cell.depth; d > 0; d -= 1) {
          if ($cell.node(d).type.spec.tableRole !== "table") continue;
          tablePos = $cell.before(d);
          break;
        }

        if (tablePos === hoverBlock.pos) {
          const target = Math.max(1, Math.min(editor.state.doc.content.size, $cell.pos + 1));
          const tr = editor.state.tr.setSelection(TextSelection.near(editor.state.doc.resolve(target)));
          editor.view.dispatch(tr);
          editor.view.focus();
          return true;
        }
      }
    }

    // Prefer the current selection when it's already inside the hovered table.
    if (isInTable(editor.state)) {
      const $head = editor.state.selection.$head;
      for (let d = $head.depth; d > 0; d -= 1) {
        if ($head.node(d).type.spec.tableRole !== "table") continue;
        const tablePos = $head.before(d);
        if (tablePos === hoverBlock.pos) return true;
        break;
      }
    }

    return false;
  }, [editor, hoverBlock, hoverTableCell]);

  const focusHoverTableCell = React.useCallback(() => {
    if (!editor || !hoverBlock || hoverBlock.nodeType !== "table" || !hoverTableCell) return false;

    const probePos = Math.max(0, Math.min(editor.state.doc.content.size, hoverTableCell.pos));
    const $probe = editor.state.doc.resolve(probePos);
    const $cell = cellAround($probe) ?? cellNear($probe);
    if (!$cell) return false;

    let tablePos: number | null = null;
    for (let d = $cell.depth; d > 0; d -= 1) {
      if ($cell.node(d).type.spec.tableRole !== "table") continue;
      tablePos = $cell.before(d);
      break;
    }
    if (tablePos !== hoverBlock.pos) return false;

    const target = Math.max(1, Math.min(editor.state.doc.content.size, $cell.pos + 1));
    const tr = editor.state.tr.setSelection(TextSelection.near(editor.state.doc.resolve(target)));
    editor.view.dispatch(tr);
    editor.view.focus();
    return true;
  }, [editor, hoverBlock, hoverTableCell]);

  const canRunTableCellActions = React.useMemo(() => {
    if (!editor || !hoverBlock || hoverBlock.nodeType !== "table") return false;

    if (isInTable(editor.state)) {
      const $head = editor.state.selection.$head;
      for (let d = $head.depth; d > 0; d -= 1) {
        if ($head.node(d).type.spec.tableRole !== "table") continue;
        return $head.before(d) === hoverBlock.pos;
      }
    }

    if (!hoverTableCell) return false;
    try {
      const probePos = Math.max(0, Math.min(editor.state.doc.content.size, hoverTableCell.pos));
      const $probe = editor.state.doc.resolve(probePos);
      return Boolean(cellAround($probe) ?? cellNear($probe));
    } catch {
      return false;
    }
  }, [editor, hoverBlock, hoverTableCell]);

  const focusTopLevelBlockIndex = React.useCallback((index: number) => {
    if (!editor) return;
    const { doc } = editor.state;
    if (index < 0 || index >= doc.childCount) return;

    const pos = getChildPos(doc, 0, index);
    const node = doc.child(index);
    const tr = editor.state.tr;

    if (node?.type?.name === "table" && node?.type?.spec?.selectable) {
      tr.setSelection(NodeSelection.create(doc, pos));
    } else {
      tr.setSelection(TextSelection.near(doc.resolve(Math.min(doc.content.size, pos + 1))));
    }

    editor.view.dispatch(tr);
    editor.view.focus();
  }, [editor]);

  const selectBlockByIndex = React.useCallback((index: number, options?: { extendRange?: boolean }) => {
    if (!editor || editor.state.doc.childCount === 0) return;
    const safeIndex = Math.max(0, Math.min(editor.state.doc.childCount - 1, index));

    if (options?.extendRange && blockSelectionAnchorRef.current !== null) {
      const anchor = Math.max(0, Math.min(editor.state.doc.childCount - 1, blockSelectionAnchorRef.current));
      const rangeStart = Math.min(anchor, safeIndex);
      const rangeEnd = Math.max(anchor, safeIndex);
      const next = Array.from({ length: rangeEnd - rangeStart + 1 }, (_, offset) => rangeStart + offset);
      setSelectedBlockIndices(next);
      focusTopLevelBlockIndex(safeIndex);
      return;
    }

    blockSelectionAnchorRef.current = safeIndex;
    setSelectedBlockIndices([safeIndex]);
    focusTopLevelBlockIndex(safeIndex);
  }, [editor, focusTopLevelBlockIndex]);

  const selectHoverBlockFromGutter = React.useCallback((event?: { shiftKey?: boolean }) => {
    if (!editor || !hoverBlock) return;
    const blockIndex = getTopLevelIndexFromPos(editor.state.doc, hoverBlock.pos);
    if (blockIndex === null) return;
    selectBlockByIndex(blockIndex, { extendRange: Boolean(event?.shiftKey) });
  }, [editor, hoverBlock, selectBlockByIndex]);

  const resolveActiveBlockIndices = React.useCallback((): number[] => {
    if (!editor) return [];

    const selected = normalizeTopLevelIndices(selectedBlockIndicesRef.current, editor.state.doc.childCount);
    if (selected.length > 0) return selected;

    if (hoverBlock) {
      const hoverIndex = getTopLevelIndexFromPos(editor.state.doc, hoverBlock.pos);
      if (hoverIndex !== null) return [hoverIndex];
    }

    const fallbackIndex = editor.state.selection.$from.index(0);
    if (fallbackIndex >= 0 && fallbackIndex < editor.state.doc.childCount) {
      return [fallbackIndex];
    }

    return [];
  }, [editor, hoverBlock]);

  const deleteBlocksByIndex = React.useCallback((indices: number[]): number[] => {
    if (!editor) return [];

    const normalized = normalizeTopLevelIndices(indices, editor.state.doc.childCount);
    if (normalized.length === 0) return [];

    const tr = editor.state.tr;
    const firstDeleted = normalized[0];
    for (let idx = normalized.length - 1; idx >= 0; idx -= 1) {
      const sourceIndex = normalized[idx];
      if (sourceIndex >= tr.doc.childCount) continue;
      const sourcePos = getChildPos(tr.doc, 0, sourceIndex);
      const sourceNode = tr.doc.child(sourceIndex);
      tr.delete(sourcePos, sourcePos + sourceNode.nodeSize);
    }

    if (tr.doc.childCount > 0) {
      const nextIndex = Math.max(0, Math.min(tr.doc.childCount - 1, firstDeleted));
      const nextPos = getChildPos(tr.doc, 0, nextIndex);
      const nextNode = tr.doc.child(nextIndex);
      if (nextNode?.type?.spec?.selectable) {
        tr.setSelection(NodeSelection.create(tr.doc, nextPos));
      } else {
        tr.setSelection(TextSelection.near(tr.doc.resolve(Math.min(tr.doc.content.size, nextPos + 1))));
      }
    }

    editor.view.dispatch(tr.scrollIntoView());
    return normalized;
  }, [editor]);

  const duplicateBlocksByIndex = React.useCallback((indices: number[]): number[] => {
    if (!editor) return [];

    const normalized = normalizeTopLevelIndices(indices, editor.state.doc.childCount);
    if (normalized.length === 0) return [];

    const clonedNodes = normalized
      .map((sourceIndex) => editor.state.doc.child(sourceIndex))
      .map((node) => node.copy(node.content));

    const insertIndex = normalized[normalized.length - 1] + 1;
    const insertPos = getChildPos(editor.state.doc, 0, insertIndex);
    const tr = editor.state.tr.insert(insertPos, Fragment.fromArray(clonedNodes));

    const duplicatedIndices = clonedNodes.map((_, offset) => insertIndex + offset);
    if (duplicatedIndices.length > 0) {
      const firstPos = getChildPos(tr.doc, 0, duplicatedIndices[0]);
      const firstNode = tr.doc.child(duplicatedIndices[0]);
      if (firstNode?.type?.spec?.selectable) {
        tr.setSelection(NodeSelection.create(tr.doc, firstPos));
      } else {
        tr.setSelection(TextSelection.near(tr.doc.resolve(Math.min(tr.doc.content.size, firstPos + 1))));
      }
    }

    editor.view.dispatch(tr.scrollIntoView());
    return duplicatedIndices;
  }, [editor]);

  const duplicateActiveBlocks = React.useCallback(() => {
    if (!editor) return;
    const active = resolveActiveBlockIndices();
    if (active.length === 0) return;
    const duplicated = duplicateBlocksByIndex(active);
    if (duplicated.length === 0) return;

    blockSelectionAnchorRef.current = duplicated[0];
    setSelectedBlockIndices(duplicated);
    setHoverMenuOpen(false);

    window.requestAnimationFrame(() => {
      const root = editor.view.dom as HTMLElement;
      const hovered = root.children.item(duplicated[0]);
      if (hovered instanceof HTMLElement) {
        setHoverFromElement(hovered, { keepMenuOpen: false });
      }
    });
  }, [duplicateBlocksByIndex, editor, resolveActiveBlockIndices, setHoverFromElement]);

  const wrapBlocksInCalloutByIndex = React.useCallback((indices: number[], tone: CalloutTone): number[] => {
    if (!editor) return [];

    const normalized = normalizeTopLevelIndices(indices, editor.state.doc.childCount);
    if (normalized.length === 0) return [];

    const calloutType = editor.state.schema.nodes.callout;
    const paragraphType = editor.state.schema.nodes.paragraph;
    if (!calloutType) return [];

    const defaultEmoji = CALLOUT_TONE_META.find((item) => item.tone === tone)?.emoji || "💡";
    const tr = editor.state.tr;
    const convertedIndices: number[] = [];

    for (let idx = normalized.length - 1; idx >= 0; idx -= 1) {
      const sourceIndex = normalized[idx];
      if (sourceIndex < 0 || sourceIndex >= tr.doc.childCount) continue;

      const sourcePos = getChildPos(tr.doc, 0, sourceIndex);
      const sourceNode = tr.doc.child(sourceIndex);

      if (sourceNode.type.name === "callout") {
        const currentAttrs = sourceNode.attrs as Record<string, unknown>;
        const existingEmoji = String(currentAttrs.emoji || "").trim();

        tr.setNodeMarkup(sourcePos, undefined, {
          ...currentAttrs,
          tone,
          emoji: existingEmoji || defaultEmoji,
        });

        convertedIndices.unshift(sourceIndex);
        continue;
      }

      let contentNode = sourceNode;
      if (!sourceNode.isBlock) {
        if (!paragraphType) continue;
        const text = String(sourceNode.textContent || "");
        contentNode = paragraphType.create({}, text ? editor.state.schema.text(text) : undefined);
      }

      const wrappedNode = calloutType.create(
        { tone, emoji: defaultEmoji },
        Fragment.fromArray([contentNode.copy(contentNode.content)]),
      );

      tr.replaceWith(sourcePos, sourcePos + sourceNode.nodeSize, wrappedNode);
      convertedIndices.unshift(sourceIndex);
    }

    if (convertedIndices.length === 0) return [];

    const focusPos = getChildPos(tr.doc, 0, convertedIndices[0]);
    tr.setSelection(NodeSelection.create(tr.doc, focusPos));

    editor.view.dispatch(tr.scrollIntoView());
    editor.view.focus();
    return convertedIndices;
  }, [editor]);

  const convertActiveBlocksToCallout = React.useCallback((tone: CalloutTone = "tip") => {
    if (!editor) return;

    const active = resolveActiveBlockIndices();
    if (active.length === 0) return;

    const converted = wrapBlocksInCalloutByIndex(active, tone);
    if (converted.length === 0) return;

    blockSelectionAnchorRef.current = converted[0] ?? null;
    setSelectedBlockIndices(converted);
    setHoverColorPanel(null);
    setHoverMenuOpen(false);

    window.requestAnimationFrame(() => {
      const root = editor.view.dom as HTMLElement;
      const hovered = root.children.item(converted[0]);
      if (hovered instanceof HTMLElement) {
        setHoverFromElement(hovered, { keepMenuOpen: false });
      }
    });
  }, [editor, resolveActiveBlockIndices, setHoverFromElement, wrapBlocksInCalloutByIndex]);

  const editActiveCalloutEmoji = React.useCallback(() => {
    if (!editor) return;

    const active = normalizeTopLevelIndices(resolveActiveBlockIndices(), editor.state.doc.childCount);
    if (active.length === 0) return;

    const firstCallout = active
      .map((index) => ({
        index,
        node: editor.state.doc.child(index),
      }))
      .find((entry) => entry.node?.type?.name === "callout");

    if (!firstCallout) return;

    const currentEmoji = String(firstCallout.node.attrs?.emoji || "").trim();
    const nextEmojiRaw = window.prompt("Callout emoji (optional)", currentEmoji);
    if (nextEmojiRaw === null) return;

    const nextEmoji = String(nextEmojiRaw || "").trim();
    const tr = editor.state.tr;
    let updatedCount = 0;

    for (const index of active) {
      if (index < 0 || index >= tr.doc.childCount) continue;
      const node = tr.doc.child(index);
      if (node.type.name !== "callout") continue;

      const pos = getChildPos(tr.doc, 0, index);
      tr.setNodeMarkup(pos, undefined, {
        ...node.attrs,
        emoji: nextEmoji,
      });
      updatedCount += 1;
    }

    if (updatedCount === 0) return;

    editor.view.dispatch(tr);
    setHoverMenuOpen(false);
    setHoverColorPanel(null);
  }, [editor, resolveActiveBlockIndices]);

  const applyColorToBlockRange = React.useCallback((
    indices: number[],
    options: { textColor?: string | null; backgroundColor?: string | null },
  ) => {
    if (!editor) return;

    const normalized = normalizeTopLevelIndices(indices, editor.state.doc.childCount);
    if (normalized.length === 0) return;

    normalized.forEach((index) => {
      const doc = editor.state.doc;
      if (index < 0 || index >= doc.childCount) return;
      const node = doc.child(index);
      const from = getChildPos(doc, 0, index) + 1;
      const to = from + node.content.size;
      if (to <= from) return;

      const chain = editor.chain().focus().setTextSelection({ from, to });
      if (Object.prototype.hasOwnProperty.call(options, "textColor")) {
        if (options.textColor) {
          chain.setColor(options.textColor);
        } else {
          chain.unsetColor();
        }
      }

      if (Object.prototype.hasOwnProperty.call(options, "backgroundColor")) {
        if (options.backgroundColor) {
          chain.setHighlight({ color: options.backgroundColor });
        } else {
          chain.unsetHighlight();
        }
      }

      chain.run();
    });

    if (normalized.length > 0) {
      focusTopLevelBlockIndex(normalized[normalized.length - 1]);
    }
  }, [editor, focusTopLevelBlockIndex]);

  const applyTextColorToActiveBlocks = React.useCallback((color: string | null) => {
    const active = resolveActiveBlockIndices();
    if (active.length === 0) return;
    applyColorToBlockRange(active, { textColor: color });
    setHoverMenuOpen(false);
  }, [applyColorToBlockRange, resolveActiveBlockIndices]);

  const applyBackgroundColorToActiveBlocks = React.useCallback((color: string | null) => {
    const active = resolveActiveBlockIndices();
    if (active.length === 0) return;
    applyColorToBlockRange(active, { backgroundColor: color });
    setHoverMenuOpen(false);
  }, [applyColorToBlockRange, resolveActiveBlockIndices]);

  const deleteActiveBlocks = React.useCallback((): boolean => {
    const active = resolveActiveBlockIndices();
    if (active.length === 0) return false;
    const deleted = deleteBlocksByIndex(active);
    if (deleted.length === 0) return false;

    setHoverMenuOpen(false);
    clearHoverBlock();
    clearBlockSelection();
    return true;
  }, [clearBlockSelection, clearHoverBlock, deleteBlocksByIndex, resolveActiveBlockIndices]);

  React.useEffect(() => {
    if (!editor || !editable) return;

    const onEditorKeyDown = (event: KeyboardEvent) => {
      const isDuplicateShortcut = (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "d";
      if (isDuplicateShortcut) {
        event.preventDefault();
        duplicateActiveBlocks();
        return;
      }

      if (event.key !== "Backspace" && event.key !== "Delete") return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (selectedBlockIndicesRef.current.length === 0) return;
      event.preventDefault();
      deleteActiveBlocks();
    };

    const dom = editor.view.dom;
    dom.addEventListener("keydown", onEditorKeyDown);
    return () => dom.removeEventListener("keydown", onEditorKeyDown);
  }, [deleteActiveBlocks, duplicateActiveBlocks, editable, editor]);

  const insertBlockBelow = React.useCallback(() => {
    if (!editor || !hoverBlock) return;
    const targetNode = editor.state.doc.nodeAt(hoverBlock.pos);
    if (!targetNode) return;

    const paragraphType = editor.state.schema.nodes.paragraph;
    if (!paragraphType) return;

    const insertPos = hoverBlock.pos + targetNode.nodeSize;
    const paragraph = paragraphType.create();
    const tr = editor.state.tr.insert(insertPos, paragraph);
    tr.setSelection(TextSelection.near(tr.doc.resolve(Math.min(tr.doc.content.size, insertPos + 1))));
    editor.view.dispatch(tr.scrollIntoView());
    editor.view.focus();
  }, [editor, hoverBlock]);

  const focusTableCell = React.useCallback((tablePos: number, rowIndex: number, columnIndex = 0): boolean => {
    if (!editor) return false;

    const tableNode = editor.state.doc.nodeAt(tablePos);
    if (!tableNode || tableNode.type.name !== "table" || tableNode.childCount === 0) return false;
    if (rowIndex < 0 || rowIndex >= tableNode.childCount) return false;

    let rowStart = tablePos + 1;
    for (let rowCursor = 0; rowCursor < rowIndex; rowCursor += 1) {
      rowStart += tableNode.child(rowCursor).nodeSize;
    }

    const rowNode = tableNode.child(rowIndex);
    if (!rowNode || rowNode.childCount === 0) return false;
    const safeColumn = Math.max(0, Math.min(rowNode.childCount - 1, columnIndex));

    let cellStart = rowStart + 1;
    for (let colCursor = 0; colCursor < safeColumn; colCursor += 1) {
      cellStart += rowNode.child(colCursor).nodeSize;
    }

    const target = Math.max(1, Math.min(editor.state.doc.content.size, cellStart + 1));
    const tr = editor.state.tr.setSelection(TextSelection.near(editor.state.doc.resolve(target)));
    editor.view.dispatch(tr);
    editor.view.focus();
    return true;
  }, [editor]);

  const focusRightmostTableColumn = React.useCallback((): boolean => {
    if (!editor || !hoverBlock || hoverBlock.nodeType !== "table") return false;

    const tableNode = editor.state.doc.nodeAt(hoverBlock.pos);
    const location = getTableRightmostCellLocation(tableNode);
    if (!location) return false;

    return focusTableCell(hoverBlock.pos, location.rowIndex, location.columnIndex);
  }, [editor, focusTableCell, hoverBlock]);

  const addTableColumnAtRight = React.useCallback((): boolean => {
    if (!editor || !focusRightmostTableColumn()) return false;
    return editor.chain().focus().addColumnAfter().run();
  }, [editor, focusRightmostTableColumn]);

  const deleteTableColumnAtRight = React.useCallback((): boolean => {
    if (!editor || !hoverBlock || hoverBlock.nodeType !== "table") return false;

    const tableNode = editor.state.doc.nodeAt(hoverBlock.pos);
    const location = getTableRightmostCellLocation(tableNode);
    if (!tableNode || !location) return false;
    if (location.columnIndex <= 0) return false;
    if (tableColumnHasUserContent(tableNode, location.columnIndex)) return false;

    if (!focusRightmostTableColumn()) return false;
    if (!editor.can().chain().focus().deleteColumn().run()) return false;
    return editor.chain().focus().deleteColumn().run();
  }, [editor, focusRightmostTableColumn, hoverBlock]);

  const startDragBlock = React.useCallback((
    event: { clientX: number; clientY: number; preventDefault: () => void },
    initialPos?: number,
  ) => {
    if (!editor) return;
    const startPos = typeof initialPos === "number" ? initialPos : hoverBlock?.pos;
    if (typeof startPos !== "number") return;
    const startIndex = getTopLevelIndexFromPos(editor.state.doc, startPos);
    if (startIndex === null) return;
    event.preventDefault();

    setHoverMenuOpen(false);
    let currentIndices = normalizeTopLevelIndices(selectedBlockIndicesRef.current, editor.state.doc.childCount);
    if (!currentIndices.includes(startIndex)) {
      currentIndices = [startIndex];
      blockSelectionAnchorRef.current = startIndex;
      setSelectedBlockIndices(currentIndices);
    }

    const startX = event.clientX;
    const startY = event.clientY;
    let dragging = false;
    let frame = 0;
    let lastAppliedInsertIndex: number | null = null;
    const startThreshold = 5;
    const root = editor.view.dom as HTMLElement;

    const preventSelection = (selectionEvent: Event) => {
      selectionEvent.preventDefault();
    };
    const preventNativeDrag = (dragEvent: DragEvent) => {
      dragEvent.preventDefault();
    };
    const cleanupDragSession = () => {
      document.removeEventListener("selectstart", preventSelection);
      root.removeEventListener("dragstart", preventNativeDrag);
      root.classList.remove("editor-block-dragging");
    };

    document.addEventListener("selectstart", preventSelection);
    root.addEventListener("dragstart", preventNativeDrag);
    root.classList.add("editor-block-dragging");

    const onMove = (moveEvent: MouseEvent) => {
      if (frame) return;

      frame = window.requestAnimationFrame(() => {
        frame = 0;

        if (!dragging) {
          const dx = Math.abs(moveEvent.clientX - startX);
          const dy = Math.abs(moveEvent.clientY - startY);
          if (dx < startThreshold && dy < startThreshold) return;
          dragging = true;
          setIsDraggingBlock(true);
        }

        let targetInsertIndex: number | null = null;
        const rootRect = root.getBoundingClientRect();
        const probeX = Math.max(rootRect.left + 4, Math.min(rootRect.right - 4, moveEvent.clientX));
        const targetEl = findTopLevelBlockAtPoint(root, probeX, moveEvent.clientY);

        if (targetEl) {
          const targetPos = getTopLevelBlockPosFromDom(editor, targetEl);
          if (targetPos !== null) {
            const targetIndex = getTopLevelIndexFromPos(editor.state.doc, targetPos);
            if (targetIndex !== null) {
              const targetRect = targetEl.getBoundingClientRect();
              const insertAfter = moveEvent.clientY > targetRect.top + targetRect.height / 2;
              targetInsertIndex = targetIndex + (insertAfter ? 1 : 0);
            }
          }
        } else {
          if (moveEvent.clientY <= rootRect.top) {
            targetInsertIndex = 0;
          } else if (moveEvent.clientY >= rootRect.bottom) {
            targetInsertIndex = editor.state.doc.childCount;
          }
        }

        if (targetInsertIndex === null) return;
        if (targetInsertIndex === lastAppliedInsertIndex) return;

        const nextIndices = moveBlocksToInsertIndex(editor, currentIndices, targetInsertIndex);
        if (!nextIndices || nextIndices.length === 0) return;
        const changed = (
          nextIndices.length !== currentIndices.length
          || nextIndices.some((index, idx) => index !== currentIndices[idx])
        );
        currentIndices = nextIndices;
        lastAppliedInsertIndex = targetInsertIndex;
        if (!changed) return;

        blockSelectionAnchorRef.current = nextIndices[0] ?? null;
        setSelectedBlockIndices(nextIndices);

        const firstMovedEl = root.children.item(nextIndices[0]);
        if (firstMovedEl instanceof HTMLElement) {
          setHoverFromElement(firstMovedEl, { keepMenuOpen: true });
        }
      });
    };

    const onUp = () => {
      if (frame) {
        window.cancelAnimationFrame(frame);
      }
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      cleanupDragSession();
      if (dragging) {
        setIsDraggingBlock(false);
        editor.view.focus();
        return;
      }

      setHoverMenuOpen(true);
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, [editor, hoverBlock, setHoverFromElement]);

  React.useEffect(() => {
    if (!editor || !editable) return;
    const root = editor.view.dom as HTMLElement;

    const resolveTopLevelBlockFromTarget = (target: EventTarget | null): HTMLElement | null => {
      let current = target instanceof HTMLElement ? target : null;
      while (current && current !== root) {
        if (current.parentElement === root) return current;
        current = current.parentElement;
      }
      return null;
    };

    const onDividerMouseDown = (event: MouseEvent) => {
      if (isDraggingBlock || event.button !== 0) return;
      if (!(event.target instanceof HTMLElement)) return;

      const dividerEl = event.target.closest(".editor-divider-block");
      if (!(dividerEl instanceof HTMLElement)) return;

      const blockEl = resolveTopLevelBlockFromTarget(dividerEl);
      if (!blockEl) return;

      const blockPos = getTopLevelBlockPosFromDom(editor, blockEl);
      if (blockPos === null) return;

      const node = editor.state.doc.nodeAt(blockPos);
      if (node?.type?.name !== "horizontalRule") return;

      cancelScheduledHoverClear();
      setHoverFromElement(blockEl, { keepMenuOpen: true });
      startDragBlock(
        {
          clientX: event.clientX,
          clientY: event.clientY,
          preventDefault: () => event.preventDefault(),
        },
        blockPos,
      );
    };

    root.addEventListener("mousedown", onDividerMouseDown);
    return () => root.removeEventListener("mousedown", onDividerMouseDown);
  }, [cancelScheduledHoverClear, editable, editor, isDraggingBlock, setHoverFromElement, startDragBlock]);

  const startTableRightColumnDrag = React.useCallback((event: React.MouseEvent<HTMLElement>) => {
    if (!editor || !hoverBlock || hoverBlock.nodeType !== "table") return;
    event.preventDefault();
    setHoverMenuOpen(false);

    const startX = event.clientX;
    let lastX = event.clientX;
    let dragBuffer = 0;
    let dragging = false;
    let frame = 0;
    const startThreshold = 4;
    const columnStep = 36;
    const root = editor.view.dom as HTMLElement;

    const preventSelection = (selectionEvent: Event) => {
      selectionEvent.preventDefault();
    };
    const preventNativeDrag = (dragEvent: DragEvent) => {
      dragEvent.preventDefault();
    };
    const cleanupDragSession = () => {
      document.removeEventListener("selectstart", preventSelection);
      root.removeEventListener("dragstart", preventNativeDrag);
      root.classList.remove("editor-block-dragging");
    };

    document.addEventListener("selectstart", preventSelection);
    root.addEventListener("dragstart", preventNativeDrag);
    root.classList.add("editor-block-dragging");

    const onMove = (moveEvent: MouseEvent) => {
      if (frame) return;

      frame = window.requestAnimationFrame(() => {
        frame = 0;

        if (!dragging) {
          if (Math.abs(moveEvent.clientX - startX) < startThreshold) return;
          dragging = true;
          setIsDraggingBlock(true);
        }

        const delta = moveEvent.clientX - lastX;
        lastX = moveEvent.clientX;
        if (delta === 0) return;

        dragBuffer += delta;

        while (dragBuffer >= columnStep) {
          const inserted = addTableColumnAtRight();
          if (!inserted) {
            dragBuffer = 0;
            break;
          }
          dragBuffer -= columnStep;
        }

        while (dragBuffer <= -columnStep) {
          const deleted = deleteTableColumnAtRight();
          if (!deleted) {
            dragBuffer = 0;
            break;
          }
          dragBuffer += columnStep;
        }

        if (hoverBlockElementRef.current) {
          setHoverFromElement(hoverBlockElementRef.current);
        }
      });
    };

    const onUp = () => {
      if (frame) {
        window.cancelAnimationFrame(frame);
      }
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      cleanupDragSession();
      if (dragging) {
        setIsDraggingBlock(false);
        editor.view.focus();
      }
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, [addTableColumnAtRight, deleteTableColumnAtRight, editor, hoverBlock, setHoverFromElement]);

  const deleteHoverBlock = React.useCallback(() => {
    deleteActiveBlocks();
  }, [deleteActiveBlocks]);

  const addTableRowFromHover = React.useCallback(() => {
    if (!editor || !(focusHoverTableCell() || ensureHoverTableSelection())) return;
    editor.chain().focus().addRowAfter().run();
    setHoverMenuOpen(false);
  }, [editor, ensureHoverTableSelection, focusHoverTableCell]);

  const addTableColumnFromHover = React.useCallback(() => {
    if (!editor || !(focusHoverTableCell() || ensureHoverTableSelection())) return;
    editor.chain().focus().addColumnAfter().run();
    setHoverMenuOpen(false);
  }, [editor, ensureHoverTableSelection, focusHoverTableCell]);

  const addTableRowBeforeFromHover = React.useCallback(() => {
    if (!editor || !(focusHoverTableCell() || ensureHoverTableSelection())) return;
    editor.chain().focus().addRowBefore().run();
    setHoverMenuOpen(false);
  }, [editor, ensureHoverTableSelection, focusHoverTableCell]);

  const deleteTableRowFromHover = React.useCallback(() => {
    if (!editor || !(focusHoverTableCell() || ensureHoverTableSelection())) return;
    editor.chain().focus().deleteRow().run();
    setHoverMenuOpen(false);
  }, [editor, ensureHoverTableSelection, focusHoverTableCell]);

  const addTableColumnBeforeFromHover = React.useCallback(() => {
    if (!editor || !(focusHoverTableCell() || ensureHoverTableSelection())) return;
    editor.chain().focus().addColumnBefore().run();
    setHoverMenuOpen(false);
  }, [editor, ensureHoverTableSelection, focusHoverTableCell]);

  const deleteTableColumnFromHover = React.useCallback(() => {
    if (!editor || !(focusHoverTableCell() || ensureHoverTableSelection())) return;
    editor.chain().focus().deleteColumn().run();
    setHoverMenuOpen(false);
  }, [editor, ensureHoverTableSelection, focusHoverTableCell]);

  const mergeOrSplitCellFromHover = React.useCallback(() => {
    if (!editor || !ensureHoverTableSelection()) return;
    if (editor.can().chain().focus().mergeCells().run()) {
      editor.chain().focus().mergeCells().run();
    } else if (editor.can().chain().focus().splitCell().run()) {
      editor.chain().focus().splitCell().run();
    }
    setHoverMenuOpen(false);
  }, [editor, ensureHoverTableSelection]);

  const hoverMenuPosition = React.useMemo(() => {
    if (!hoverBlock) return null;

    const baseTop = hoverBlock.top + 30;
    const baseLeft = hoverBlock.left;
    const fallback = { top: baseTop, left: baseLeft, maxHeight: 300, offsetX: -30 };

    if (!hoverMenuOpen || typeof window === "undefined") return fallback;
    const shell = editorShellRef.current;
    if (!shell) return fallback;

    const shellRect = shell.getBoundingClientRect();
    const viewportPadding = 8;
    const estimatedHeight = hoverBlock.nodeType === "table" ? 420 : 220;
    const estimatedWidth = hoverBlock.nodeType === "table" ? 300 : 272;

    const minTop = Math.max(4, viewportPadding - shellRect.top);
    const maxTop = Math.max(minTop, window.innerHeight - shellRect.top - estimatedHeight - viewportPadding);

    const belowTop = Math.max(minTop, Math.min(baseTop, maxTop));
    const belowMaxHeight = Math.max(140, window.innerHeight - shellRect.top - belowTop - viewportPadding);

    const aboveTop = Math.max(minTop, baseTop - estimatedHeight - 12);
    const aboveMaxHeight = Math.max(140, baseTop - aboveTop - 10);

    const placeAbove = belowMaxHeight < 220 && aboveMaxHeight > belowMaxHeight;
    const nextTop = placeAbove ? aboveTop : belowTop;
    const maxHeight = placeAbove ? aboveMaxHeight : belowMaxHeight;

    const desiredAbsLeft = shellRect.left + baseLeft - 30;
    const minAbsLeft = viewportPadding;
    const maxAbsLeft = Math.max(minAbsLeft, window.innerWidth - estimatedWidth - viewportPadding);
    const clampedAbsLeft = Math.max(minAbsLeft, Math.min(desiredAbsLeft, maxAbsLeft));
    const offsetX = clampedAbsLeft - (shellRect.left + baseLeft);

    return {
      top: nextTop,
      left: baseLeft,
      maxHeight,
      offsetX,
    };
  }, [hoverBlock, hoverMenuOpen]);

  const hoverColorPanelPosition = React.useMemo(() => {
    if (!hoverMenuOpen || !hoverColorPanel || !hoverBlock || typeof window === "undefined") return null;

    const shell = editorShellRef.current;
    if (!shell) return null;

    const shellRect = shell.getBoundingClientRect();
    const viewportPadding = 8;
    const menuWidth = 250;
    const panelWidth = 230;
    const gap = 8;

    const menuTop = hoverMenuPosition?.top ?? (hoverBlock.top + 30);
    const menuLeft = hoverMenuPosition?.left ?? hoverBlock.left;
    const menuOffsetX = hoverMenuPosition?.offsetX ?? -30;
    const menuAbsLeft = shellRect.left + menuLeft + menuOffsetX;

    const rightAbsLeft = menuAbsLeft + menuWidth + gap;
    const canPlaceRight = rightAbsLeft + panelWidth <= window.innerWidth - viewportPadding;
    const panelAbsLeft = canPlaceRight
      ? rightAbsLeft
      : Math.max(viewportPadding, menuAbsLeft - panelWidth - gap);

    return {
      top: menuTop,
      left: panelAbsLeft - shellRect.left,
      maxHeight: hoverMenuPosition?.maxHeight,
    };
  }, [hoverBlock, hoverColorPanel, hoverMenuOpen, hoverMenuPosition]);

  const activeHoverColorOptions = hoverColorPanel === "background"
    ? BLOCK_BACKGROUND_COLORS
    : BLOCK_TEXT_COLORS;

  const activeHoverColorLabel = hoverColorPanel === "background"
    ? "Background color"
    : "Text color";

  const blockControlsLeft = React.useMemo(() => {
    if (typeof window === "undefined") return 0;
    const shell = editorShellRef.current;
    if (!shell) return 0;

    const desiredAbsLeft = shell.getBoundingClientRect().left - 58;
    const minAbsLeft = 10;
    const clampedAbsLeft = Math.max(minAbsLeft, desiredAbsLeft);
    return clampedAbsLeft - shell.getBoundingClientRect().left;
  }, [hoverBlock]);

  const hoveredBlockIndex = React.useMemo(() => {
    if (!editor || !hoverBlock) return null;
    return getTopLevelIndexFromPos(editor.state.doc, hoverBlock.pos);
  }, [editor, hoverBlock]);

  const activeCalloutTone = React.useMemo<CalloutTone | null>(() => {
    if (!editor || !hoverBlock || hoverBlock.nodeType !== "callout") return null;
    const node = editor.state.doc.nodeAt(hoverBlock.pos);
    if (!node || node.type.name !== "callout") return null;
    const tone = String(node.attrs?.tone || "tip");
    if (tone === "note" || tone === "warning" || tone === "success") return tone;
    return "tip";
  }, [editor, hoverBlock]);

  const activeCalloutToneEmoji = React.useMemo(() => {
    if (!activeCalloutTone) return "💡";
    return CALLOUT_TONE_META.find((item) => item.tone === activeCalloutTone)?.emoji || "💡";
  }, [activeCalloutTone]);

  const isHoverBlockSelected = (
    hoveredBlockIndex !== null
    && selectedBlockIndices.includes(hoveredBlockIndex)
  );

  const tableCellActionAnchors = React.useMemo(() => {
    if (!hoverBlock || hoverBlock.nodeType !== "table" || !hoverTableCell) return null;

    const rowHeight = Math.max(18, hoverTableCell.bottom - hoverTableCell.top);
    const colWidth = Math.max(18, hoverTableCell.right - hoverTableCell.left);
    const rowCenter = hoverTableCell.top + rowHeight / 2;
    const colCenter = hoverTableCell.left + colWidth / 2;

    const rowIconTop = Math.max(8, rowCenter - 9);
    const rowIconLeft = Math.max(8, hoverBlock.left - 26);
    const colIconTop = Math.max(8, hoverTableCell.top - 10);
    const colIconLeft = Math.max(8, colCenter - 9);

    return {
      rowIconTop,
      rowIconLeft,
      colIconTop,
      colIconLeft,
      rowMenuTop: Math.max(8, rowCenter - 14),
      rowMenuLeft: rowIconLeft + 24,
      colMenuTop: colIconTop + 24,
      colMenuLeft: Math.max(8, colCenter - 24),
    };
  }, [hoverBlock, hoverTableCell]);

  return (
    <div className={cn("rounded-lg border bg-card/50 border-border/40", className)}>
      {showToolbar && (
        <div
          className={cn(
            "border-b border-border/40 bg-muted/10 px-2 py-2",
            stickyToolbar && "sticky top-[var(--editor-toolbar-sticky-top)] z-30 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/85"
          )}
          style={toolbarStickyStyle}
        >
          <TipTapToolbar editor={editor} />
        </div>
      )}
      {editable && (
        <div className="border-b border-border/30 bg-background/60 px-4 py-1.5 text-[11px] text-muted-foreground">
          Type <span className="font-medium">/</span> for quick commands (Text, Lists, Layout, Media, Advanced)
        </div>
      )}
      <div ref={editorShellRef} className="px-4 py-4 relative">
        {editor && showBubbleMenu && editable && (
          <BubbleMenu
            editor={editor}
          >
            <TipTapBubbleMenu editor={editor} />
          </BubbleMenu>
        )}

        {editable && hoverBlock && !slashOpen && (
          <>
            <div
              className="absolute left-0 z-30"
              data-editor-block-ui="true"
              onMouseEnter={onHoverUiEnter}
              onMouseLeave={onHoverUiLeave}
              onMouseDownCapture={(event) => {
                if (event.button !== 0) return;
                event.preventDefault();
                event.stopPropagation();
                // Notion-like: allow selecting table blocks directly from the gutter
                // so users don't need the table menu action.
                selectHoverBlockFromGutter(event);
              }}
              style={{
                left: blockControlsLeft,
                top: hoverBlock.top + 4,
              }}
            >
              <div
                className={cn(
                  "flex items-center gap-1 rounded-md border border-border/70 bg-background/95 px-1 py-0.5 shadow-sm",
                  isHoverBlockSelected && "border-primary/55 bg-primary/10"
                )}
              >
                <button
                  type="button"
                  className="inline-flex h-5 w-5 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-muted"
                  onMouseDown={(event) => {
                    event.preventDefault();
                    insertBlockBelow();
                  }}
                  aria-label="Add block below"
                  title="Add block below"
                >
                  <Plus className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  className={cn(
                    "inline-flex h-5 w-5 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-muted",
                    isDraggingBlock ? "cursor-grabbing" : "cursor-grab"
                  )}
                  onMouseDown={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    startDragBlock(event);
                  }}
                  aria-label="Drag block / open block menu"
                  title="Drag to move selected blocks, click to open menu"
                >
                  <GripVertical className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            {/* Table add controls are rendered in the table node view (NotionLikeTableView). */}

            {tableCellActionAnchors && (
              <>
                <div
                  className="absolute z-30"
                  data-editor-block-ui="true"
                  onMouseEnter={onHoverUiEnter}
                  onMouseLeave={onHoverUiLeave}
                  style={{
                    left: tableCellActionAnchors.rowIconLeft,
                    top: tableCellActionAnchors.rowIconTop,
                  }}
                >
                  <button
                    type="button"
                    className={cn(
                      "inline-flex h-5 w-5 items-center justify-center rounded-md border border-border/70 bg-background/95 text-muted-foreground shadow-sm transition-colors hover:bg-muted",
                      tableQuickMenu === "row" && "bg-muted text-foreground"
                    )}
                    onMouseDown={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      setHoverMenuOpen(false);
                      setTableQuickMenu((prev) => (prev === "row" ? null : "row"));
                    }}
                    aria-label="Row actions"
                    title="Row actions"
                  >
                    <Rows3 className="h-3.5 w-3.5" />
                  </button>
                </div>

                <div
                  className="absolute z-30"
                  data-editor-block-ui="true"
                  onMouseEnter={onHoverUiEnter}
                  onMouseLeave={onHoverUiLeave}
                  style={{
                    left: tableCellActionAnchors.colIconLeft,
                    top: tableCellActionAnchors.colIconTop,
                  }}
                >
                  <button
                    type="button"
                    className={cn(
                      "inline-flex h-5 w-5 items-center justify-center rounded-md border border-border/70 bg-background/95 text-muted-foreground shadow-sm transition-colors hover:bg-muted",
                      tableQuickMenu === "column" && "bg-muted text-foreground"
                    )}
                    onMouseDown={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      setHoverMenuOpen(false);
                      setTableQuickMenu((prev) => (prev === "column" ? null : "column"));
                    }}
                    aria-label="Column actions"
                    title="Column actions"
                  >
                    <Columns3 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </>
            )}

            {hoverBlock.nodeType === "table" && tableQuickMenu && tableCellActionAnchors && (
              <div
                className="absolute left-0 z-40 min-w-[210px] rounded-md border border-border/70 bg-background/95 p-1 shadow-lg"
                data-editor-block-ui="true"
                onMouseEnter={onHoverUiEnter}
                onMouseLeave={onHoverUiLeave}
                style={{
                  left: tableQuickMenu === "row" ? tableCellActionAnchors.rowMenuLeft : tableCellActionAnchors.colMenuLeft,
                  top: tableQuickMenu === "row" ? tableCellActionAnchors.rowMenuTop : tableCellActionAnchors.colMenuTop,
                }}
              >
                {tableQuickMenu === "row" ? (
                  <>
                    <div className="px-2 py-1 text-[10px] uppercase tracking-[0.08em] text-muted-foreground">Row actions</div>
                    <button
                      type="button"
                      disabled={!canRunTableCellActions}
                      className="flex h-7 w-full items-center gap-2 rounded-sm px-2 text-xs text-muted-foreground transition-colors hover:bg-muted disabled:pointer-events-none disabled:opacity-50"
                      onMouseDown={(event) => {
                        event.preventDefault();
                        addTableRowBeforeFromHover();
                        setTableQuickMenu(null);
                      }}
                    >
                      <ArrowUp className="h-3.5 w-3.5" />
                      Insert row above
                    </button>
                    <button
                      type="button"
                      disabled={!canRunTableCellActions}
                      className="flex h-7 w-full items-center gap-2 rounded-sm px-2 text-xs text-muted-foreground transition-colors hover:bg-muted disabled:pointer-events-none disabled:opacity-50"
                      onMouseDown={(event) => {
                        event.preventDefault();
                        addTableRowFromHover();
                        setTableQuickMenu(null);
                      }}
                    >
                      <ArrowDown className="h-3.5 w-3.5" />
                      Insert row below
                    </button>
                    <button
                      type="button"
                      disabled={!canRunTableCellActions}
                      className="mt-1 flex h-7 w-full items-center gap-2 rounded-sm px-2 text-xs text-muted-foreground transition-colors hover:bg-muted disabled:pointer-events-none disabled:opacity-50"
                      onMouseDown={(event) => {
                        event.preventDefault();
                        mergeOrSplitCellFromHover();
                        setTableQuickMenu(null);
                      }}
                    >
                      <Rows3 className="h-3.5 w-3.5" />
                      Merge / split cell
                    </button>
                    <button
                      type="button"
                      disabled={!canRunTableCellActions}
                      className="mt-1 flex h-7 w-full items-center gap-2 rounded-sm px-2 text-xs text-destructive transition-colors hover:bg-destructive/10 disabled:pointer-events-none disabled:opacity-50"
                      onMouseDown={(event) => {
                        event.preventDefault();
                        deleteTableRowFromHover();
                        setTableQuickMenu(null);
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Delete row
                    </button>
                  </>
                ) : (
                  <>
                    <div className="px-2 py-1 text-[10px] uppercase tracking-[0.08em] text-muted-foreground">Column actions</div>
                    <button
                      type="button"
                      disabled={!canRunTableCellActions}
                      className="flex h-7 w-full items-center gap-2 rounded-sm px-2 text-xs text-muted-foreground transition-colors hover:bg-muted disabled:pointer-events-none disabled:opacity-50"
                      onMouseDown={(event) => {
                        event.preventDefault();
                        addTableColumnBeforeFromHover();
                        setTableQuickMenu(null);
                      }}
                    >
                      <ArrowLeft className="h-3.5 w-3.5" />
                      Insert column left
                    </button>
                    <button
                      type="button"
                      disabled={!canRunTableCellActions}
                      className="flex h-7 w-full items-center gap-2 rounded-sm px-2 text-xs text-muted-foreground transition-colors hover:bg-muted disabled:pointer-events-none disabled:opacity-50"
                      onMouseDown={(event) => {
                        event.preventDefault();
                        addTableColumnFromHover();
                        setTableQuickMenu(null);
                      }}
                    >
                      <ArrowRight className="h-3.5 w-3.5" />
                      Insert column right
                    </button>
                    <button
                      type="button"
                      disabled={!canRunTableCellActions}
                      className="mt-1 flex h-7 w-full items-center gap-2 rounded-sm px-2 text-xs text-destructive transition-colors hover:bg-destructive/10 disabled:pointer-events-none disabled:opacity-50"
                      onMouseDown={(event) => {
                        event.preventDefault();
                        deleteTableColumnFromHover();
                        setTableQuickMenu(null);
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Delete column
                    </button>
                  </>
                )}
              </div>
            )}

            {hoverMenuOpen && (
              <div
                className="absolute left-0 z-40 min-w-[250px] overflow-y-auto rounded-md border border-border/70 bg-background/95 p-1 shadow-lg"
                data-editor-block-ui="true"
                onMouseEnter={onHoverUiEnter}
                onMouseLeave={onHoverUiLeave}
                style={{
                  left: hoverMenuPosition?.left ?? hoverBlock.left,
                  top: hoverMenuPosition?.top ?? (hoverBlock.top + 30),
                  transform: `translateX(${hoverMenuPosition?.offsetX ?? -30}px)`,
                  maxHeight: hoverMenuPosition?.maxHeight,
                }}
              >
                <button
                  type="button"
                  className="flex h-7 w-full items-center gap-2 rounded-sm px-2 text-xs text-muted-foreground transition-colors hover:bg-muted"
                  onMouseDown={(event) => {
                    event.preventDefault();
                    duplicateActiveBlocks();
                  }}
                >
                  <Copy className="h-3.5 w-3.5" />
                  Duplicate
                </button>
                <button
                  type="button"
                  className="mt-1 flex h-7 w-full items-center gap-2 rounded-sm px-2 text-xs text-muted-foreground transition-colors hover:bg-muted"
                  onMouseDown={(event) => {
                    event.preventDefault();
                    convertActiveBlocksToCallout("tip");
                  }}
                >
                  <Lightbulb className="h-3.5 w-3.5" />
                  Turn into callout
                </button>
                <button
                  type="button"
                  className="mt-1 flex h-7 w-full items-center gap-2 rounded-sm px-2 text-xs text-destructive transition-colors hover:bg-destructive/10"
                  onMouseDown={(event) => {
                    event.preventDefault();
                    deleteHoverBlock();
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Delete
                </button>

                <div className="my-1 h-px bg-border/70" />

                <button
                  type="button"
                  className={cn(
                    "flex h-7 w-full items-center gap-2 rounded-sm px-2 text-xs text-muted-foreground transition-colors hover:bg-muted",
                    hoverColorPanel === "text" && "bg-muted"
                  )}
                  onMouseDown={(event) => {
                    event.preventDefault();
                    setHoverColorPanel("text");
                  }}
                >
                  <span className="inline-flex h-4 w-4 items-center justify-center rounded-sm border border-border/70 text-[10px] font-semibold text-muted-foreground">A</span>
                  <span className="flex-1 text-left">Text color</span>
                  <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/80" />
                </button>

                <button
                  type="button"
                  className={cn(
                    "mt-1 flex h-7 w-full items-center gap-2 rounded-sm px-2 text-xs text-muted-foreground transition-colors hover:bg-muted",
                    hoverColorPanel === "background" && "bg-muted"
                  )}
                  onMouseDown={(event) => {
                    event.preventDefault();
                    setHoverColorPanel("background");
                  }}
                >
                  <span className="inline-flex h-4 w-4 items-center justify-center rounded-sm border border-border/70 bg-muted/40" />
                  <span className="flex-1 text-left">Background color</span>
                  <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/80" />
                </button>

                {hoverBlock.nodeType === "callout" && (
                  <>
                    <div className="my-1 h-px bg-border/70" />
                    <button
                      type="button"
                      className="flex h-7 w-full items-center gap-2 rounded-sm px-2 text-xs text-muted-foreground transition-colors hover:bg-muted"
                      onMouseDown={(event) => {
                        event.preventDefault();
                        editActiveCalloutEmoji();
                      }}
                    >
                      <span className="inline-flex h-4 w-4 items-center justify-center rounded-sm border border-border/70 text-[11px]">
                        {activeCalloutToneEmoji}
                      </span>
                      Edit callout emoji
                    </button>
                    <div className="mt-1 grid grid-cols-2 gap-1 px-1">
                      {CALLOUT_TONE_META.map((option) => (
                        <button
                          key={`callout-tone-${option.tone}`}
                          type="button"
                          className={cn(
                            "flex h-7 items-center gap-2 rounded-sm border border-border/60 px-2 text-[11px] text-muted-foreground transition-colors hover:bg-muted",
                            activeCalloutTone === option.tone && "bg-muted text-foreground"
                          )}
                          onMouseDown={(event) => {
                            event.preventDefault();
                            convertActiveBlocksToCallout(option.tone);
                          }}
                        >
                          <span
                            className="inline-flex h-2.5 w-2.5 shrink-0 rounded-full border border-border/60"
                            style={{ backgroundColor: option.swatch }}
                          />
                          <span className="truncate">{option.label}</span>
                        </button>
                      ))}
                    </div>
                  </>
                )}

              </div>
            )}

            {hoverMenuOpen && hoverColorPanel && hoverColorPanelPosition && (
              <div
                className="absolute left-0 z-50 w-[230px] overflow-y-auto rounded-md border border-border/70 bg-background/95 p-1 shadow-lg"
                data-editor-block-ui="true"
                onMouseEnter={onHoverUiEnter}
                onMouseLeave={onHoverUiLeave}
                style={{
                  left: hoverColorPanelPosition.left,
                  top: hoverColorPanelPosition.top,
                  maxHeight: hoverColorPanelPosition.maxHeight,
                }}
              >
                <div className="px-2 py-1 text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
                  {activeHoverColorLabel}
                </div>
                <div className="space-y-1 p-1">
                  {activeHoverColorOptions.map((option) => (
                    <button
                      key={`${hoverColorPanel}-${option.id}`}
                      type="button"
                      className="flex h-7 w-full items-center gap-2 rounded-sm px-2 text-xs text-muted-foreground transition-colors hover:bg-muted"
                      onMouseDown={(event) => {
                        event.preventDefault();
                        if (hoverColorPanel === "background") {
                          applyBackgroundColorToActiveBlocks(option.color);
                          return;
                        }
                        applyTextColorToActiveBlocks(option.color);
                      }}
                    >
                      <span
                        className="inline-flex h-3.5 w-3.5 shrink-0 rounded-sm border border-border/70"
                        style={{ backgroundColor: option.swatch }}
                      />
                      <span className="truncate">{option.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {slashOpen && editable && (
          <div
            className="fixed z-50 w-[360px] rounded-xl border border-border/60 bg-background/95 shadow-2xl backdrop-blur"
            style={{ top: slashPosition.top, left: slashPosition.left }}
          >
            <div className="px-3 py-2 border-b border-border/50 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="text-[11px] font-medium text-muted-foreground">Slash commands</div>
                <div className="text-[11px] text-muted-foreground/80">Up/Down + Enter</div>
              </div>
              <div className="rounded-md border border-border/60 bg-background/70 px-2 py-1.5">
                <input
                  value={slashQuery}
                  onChange={(e) => setSlashQuery(e.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "ArrowDown") {
                      event.preventDefault();
                      setSlashSelectedIndex((prev) => (slashMenuItems.length ? (prev + 1) % slashMenuItems.length : 0));
                      return;
                    }
                    if (event.key === "ArrowUp") {
                      event.preventDefault();
                      setSlashSelectedIndex((prev) => {
                        if (!slashMenuItems.length) return 0;
                        return (prev - 1 + slashMenuItems.length) % slashMenuItems.length;
                      });
                      return;
                    }
                    if (event.key === "Enter") {
                      if (!slashMenuItems.length) return;
                      event.preventDefault();
                      const command = slashMenuItems[slashSelectedIndex] || slashMenuItems[0];
                      if (command) runSlashCommand(command);
                      return;
                    }
                    if (event.key === "Escape") {
                      event.preventDefault();
                      closeSlashMenu();
                    }
                  }}
                  placeholder="Filter commands"
                  className="h-5 w-full bg-transparent text-xs outline-none placeholder:text-muted-foreground/75"
                />
              </div>
            </div>

            <div className="overflow-auto p-1.5" style={{ maxHeight: slashPosition.listMaxHeight }}>
              {slashMenuItems.length === 0 ? (
                <div className="px-2 py-3 text-xs text-muted-foreground">No matching command</div>
              ) : (
                slashSections.map((section) => (
                  <div key={section.id} className="mb-2 last:mb-0">
                    <div className="px-2 py-1 flex items-center gap-1.5 text-[10px] uppercase tracking-[0.08em] text-muted-foreground/80">
                      {section.icon && <section.icon className="h-3 w-3" />}
                      <span>{section.label}</span>
                    </div>
                    <div className="space-y-1">
                      {section.commands.map((command) => {
                        const commandIndex = slashIndexById.get(command.id) ?? 0;
                        const isSelected = selectedSlashCommandId === command.id;
                        const Icon = command.icon;

                        return (
                          <button
                            key={command.id}
                            type="button"
                            className={cn(
                              "w-full rounded-lg border px-2 py-2 text-left transition-colors",
                              "hover:bg-muted/60",
                              isSelected
                                ? "border-primary/35 bg-primary/12 shadow-sm"
                                : "border-transparent"
                            )}
                            onMouseEnter={() => setSlashSelectedIndex(commandIndex)}
                            onMouseDown={(event) => {
                              event.preventDefault();
                              runSlashCommand(command);
                            }}
                          >
                            <div className="flex items-start gap-2">
                              <div
                                className={cn(
                                  "mt-0.5 rounded-md border border-border/60 bg-muted/30 p-1",
                                  isSelected && "bg-primary/20 border-primary/30 text-primary"
                                )}
                              >
                                <Icon className="h-3.5 w-3.5" />
                              </div>
                              <div className="min-w-0">
                                <div className={cn("text-sm font-medium", isSelected && "text-primary")}>{command.title}</div>
                                <div className="text-xs text-muted-foreground">{command.description}</div>
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        <EditorContent editor={editor} />
      </div>
    </div>
  );
}
