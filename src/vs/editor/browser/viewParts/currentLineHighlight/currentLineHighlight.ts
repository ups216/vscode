/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./currentLineHighlight';
import * as editorCommon from 'vs/editor/common/editorCommon';
import {ILayoutProvider, IRenderingContext, IViewContext} from 'vs/editor/browser/editorBrowser';
import {DynamicViewOverlay} from 'vs/editor/browser/view/dynamicViewOverlay';

export class CurrentLineHighlightOverlay extends DynamicViewOverlay {
	private _context:IViewContext;
	private _lineHeight:number;
	private _readOnly:boolean;
	private _layoutProvider:ILayoutProvider;
	private _selectionIsEmpty:boolean;
	private _primaryCursorIsInEditableRange:boolean;
	private _primaryCursorLineNumber:number;
	private _scrollWidth:number;

	constructor(context:IViewContext, layoutProvider:ILayoutProvider) {
		super();
		this._context = context;
		this._lineHeight = this._context.configuration.editor.lineHeight;
		this._readOnly = this._context.configuration.editor.readOnly;

		this._layoutProvider = layoutProvider;

		this._selectionIsEmpty = true;
		this._primaryCursorIsInEditableRange = true;
		this._primaryCursorLineNumber = 1;
		this._scrollWidth = this._layoutProvider.getScrollWidth();

		this._context.addEventHandler(this);
	}

	public dispose(): void {
		this._context.removeEventHandler(this);
		this._context = null;
	}

	// --- begin event handlers

	public onModelFlushed(): boolean {
		this._primaryCursorIsInEditableRange = true;
		this._selectionIsEmpty = true;
		this._primaryCursorLineNumber = 1;
		this._scrollWidth = this._layoutProvider.getScrollWidth();
		return true;
	}
	public onModelLinesDeleted(e:editorCommon.IViewLinesDeletedEvent): boolean {
		return true;
	}
	public onModelLinesInserted(e:editorCommon.IViewLinesInsertedEvent): boolean {
		return true;
	}
	public onCursorPositionChanged(e:editorCommon.IViewCursorPositionChangedEvent): boolean {
		var hasChanged = false;
		if (this._primaryCursorIsInEditableRange !== e.isInEditableRange) {
			this._primaryCursorIsInEditableRange = e.isInEditableRange;
			hasChanged = true;
		}
		if (this._primaryCursorLineNumber !== e.position.lineNumber) {
			this._primaryCursorLineNumber = e.position.lineNumber;
			hasChanged = true;
		}
		return hasChanged;
	}
	public onCursorSelectionChanged(e:editorCommon.IViewCursorSelectionChangedEvent): boolean {
		var isEmpty = e.selection.isEmpty();
		if (this._selectionIsEmpty !== isEmpty) {
			this._selectionIsEmpty = isEmpty;
			return true;
		}
		return false;
	}
	public onConfigurationChanged(e:editorCommon.IConfigurationChangedEvent): boolean {
		if (e.lineHeight) {
			this._lineHeight = this._context.configuration.editor.lineHeight;
		}
		if (e.readOnly) {
			this._readOnly = this._context.configuration.editor.readOnly;
		}
		return true;
	}
	public onLayoutChanged(layoutInfo:editorCommon.IEditorLayoutInfo): boolean {
		return true;
	}
	public onScrollChanged(e:editorCommon.IScrollEvent): boolean {
		return true;
	}
	public onZonesChanged(): boolean {
		return true;
	}
	public onScrollWidthChanged(scrollWidth:number): boolean {
		if (this._scrollWidth !== scrollWidth) {
			this._scrollWidth = scrollWidth;
			return true;
		}
		return false;
	}
	// --- end event handlers

	public prepareRender(ctx:IRenderingContext): void {
		if (!this.shouldRender()) {
			throw new Error('I did not ask to render!');
		}
		this._scrollWidth = ctx.scrollWidth;
	}

	public render(startLineNumber:number, lineNumber:number): string {
		if (lineNumber === this._primaryCursorLineNumber) {
			if (this._shouldShowCurrentLine()) {
				return (
					'<div class="current-line" style="width:'
					+ String(this._scrollWidth)
					+ 'px; height:'
					+ String(this._lineHeight)
					+ 'px;"></div>'
				);
			} else {
				return '';
			}
		}
		return '';
	}

	private _shouldShowCurrentLine(): boolean {
		return this._selectionIsEmpty && this._primaryCursorIsInEditableRange && !this._readOnly;
	}
}
