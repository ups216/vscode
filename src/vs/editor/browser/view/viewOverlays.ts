/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as browser from 'vs/base/browser/browser';
import {StyleMutator, FastDomNode, createFastDomNode} from 'vs/base/browser/styleMutator';
import {IConfigurationChangedEvent, IEditorLayoutInfo, IModelDecoration} from 'vs/editor/common/editorCommon';
import * as editorBrowser from 'vs/editor/browser/editorBrowser';
import {IVisibleLineData, ViewLayer} from 'vs/editor/browser/view/viewLayer';
import {DynamicViewOverlay} from 'vs/editor/browser/view/dynamicViewOverlay';

export class ViewOverlays extends ViewLayer {

	private _dynamicOverlays:DynamicViewOverlay[];
	private _isFocused:boolean;
	_layoutProvider:editorBrowser.ILayoutProvider;

	constructor(context:editorBrowser.IViewContext, layoutProvider:editorBrowser.ILayoutProvider) {
		super(context);

		this._dynamicOverlays = [];
		this._isFocused = false;
		this._layoutProvider = layoutProvider;

		this.domNode.setClassName('view-overlays');
	}

	public shouldRender(): boolean {
		if (super.shouldRender()) {
			return true;
		}

		for (let i = 0, len = this._dynamicOverlays.length; i < len; i++) {
			let dynamicOverlay = this._dynamicOverlays[i];
			if (dynamicOverlay.shouldRender()) {
				return true;
			}
		}

		return false;
	}

	public dispose(): void {
		super.dispose();
		this._layoutProvider = null;

		for (let i = 0, len = this._dynamicOverlays.length; i < len; i++) {
			let dynamicOverlay = this._dynamicOverlays[i];
			dynamicOverlay.dispose();
		}
		this._dynamicOverlays = null;
	}

	public getDomNode(): HTMLElement {
		return this.domNode.domNode;
	}

	public addDynamicOverlay(overlay:DynamicViewOverlay): void {
		this._dynamicOverlays.push(overlay);
	}

	// ----- event handlers

	public onViewFocusChanged(isFocused:boolean): boolean {
		this._isFocused = isFocused;
		return true;
	}

	// ----- end event handlers

	_createLine(): IVisibleLineData {
		var r = new ViewOverlayLine(this._context, this._dynamicOverlays);
		return r;
	}


	public prepareRender(ctx:editorBrowser.IRenderingContext): void {
		let toRender = this._dynamicOverlays.filter(overlay => overlay.shouldRender());

		for (let i = 0, len = toRender.length; i < len; i++) {
			let dynamicOverlay = toRender[i];
			dynamicOverlay.prepareRender(ctx);
			dynamicOverlay.onDidRender();
		}

		return null;
	}

	public render(ctx:editorBrowser.IRestrictedRenderingContext): void {
		// Overwriting to bypass `shouldRender` flag
		this._viewOverlaysRender(ctx);

		this.domNode.toggleClassName('focused', this._isFocused);
	}

	_viewOverlaysRender(ctx:editorBrowser.IRestrictedRenderingContext): void {
		super._renderLines(ctx.linesViewportData);
	}
}

class ViewOverlayLine implements IVisibleLineData {

	private _context:editorBrowser.IViewContext;
	private _dynamicOverlays:DynamicViewOverlay[];
	private _domNode: FastDomNode;
	private _renderPieces: string;
	private _lineHeight: number;

	constructor(context:editorBrowser.IViewContext, dynamicOverlays:DynamicViewOverlay[]) {
		this._context = context;
		this._lineHeight = this._context.configuration.editor.lineHeight;
		this._dynamicOverlays = dynamicOverlays;

		this._domNode = null;
		this._renderPieces = null;
	}

	public getDomNode(): HTMLElement {
		if (!this._domNode) {
			return null;
		}
		return this._domNode.domNode;
	}
	public setDomNode(domNode:HTMLElement): void {
		this._domNode = createFastDomNode(domNode);
	}

	onContentChanged(): void {
		// Nothing
	}
	onLinesInsertedAbove(): void {
		// Nothing
	}
	onLinesDeletedAbove(): void {
		// Nothing
	}
	onLineChangedAbove(): void {
		// Nothing
	}
	onTokensChanged(): void {
		// Nothing
	}
	onConfigurationChanged(e:IConfigurationChangedEvent): void {
		if (e.lineHeight) {
			this._lineHeight = this._context.configuration.editor.lineHeight;
		}
	}

	shouldUpdateHTML(startLineNumber:number, lineNumber:number, inlineDecorations:IModelDecoration[]): boolean {
		let newPieces = '';
		for (let i = 0, len = this._dynamicOverlays.length; i < len; i++) {
			let dynamicOverlay = this._dynamicOverlays[i];
			newPieces += dynamicOverlay.render(startLineNumber, lineNumber);
		}

		let piecesEqual = (this._renderPieces === newPieces);

		if (!piecesEqual) {
			this._renderPieces = newPieces;
		}

		return !piecesEqual;
	}

	getLineOuterHTML(out:string[], lineNumber:number, deltaTop:number): void {
		out.push('<div lineNumber="');
		out.push(lineNumber.toString());
		out.push('" style="top:');
		out.push(deltaTop.toString());
		out.push('px;height:');
		out.push(this._lineHeight.toString());
		out.push('px;" class="');
		out.push(editorBrowser.ClassNames.VIEW_LINE);
		out.push('">');
		out.push(this.getLineInnerHTML(lineNumber));
		out.push('</div>');
	}

	getLineInnerHTML(lineNumber: number): string {
		return this._renderPieces;
	}

	layoutLine(lineNumber: number, deltaTop:number): void {
		this._domNode.setLineNumber(String(lineNumber));
		this._domNode.setTop(deltaTop);
		this._domNode.setHeight(this._lineHeight);
	}
}

export class ContentViewOverlays extends ViewOverlays {

	private _scrollWidth: number;

	constructor(context:editorBrowser.IViewContext, layoutProvider:editorBrowser.ILayoutProvider) {
		super(context, layoutProvider);

		this._scrollWidth = this._layoutProvider.getScrollWidth();

		this.domNode.setWidth(this._scrollWidth);
		this.domNode.setHeight(0);
	}

	public onScrollWidthChanged(scrollWidth:number): boolean {
		this._scrollWidth = this._layoutProvider.getScrollWidth();
		return true;
	}

	_viewOverlaysRender(ctx:editorBrowser.IRestrictedRenderingContext): void {
		super._viewOverlaysRender(ctx);

		this.domNode.setWidth(this._scrollWidth);
	}
}

export class MarginViewOverlays extends ViewOverlays {

	private _glyphMarginLeft:number;
	private _glyphMarginWidth:number;
	private _scrollHeight:number;
	private _contentLeft: number;

	constructor(context:editorBrowser.IViewContext, layoutProvider:editorBrowser.ILayoutProvider) {
		super(context, layoutProvider);

		this._glyphMarginLeft = context.configuration.editor.layoutInfo.glyphMarginLeft;
		this._glyphMarginWidth = context.configuration.editor.layoutInfo.glyphMarginWidth;
		this._scrollHeight = layoutProvider.getScrollHeight();
		this._contentLeft = context.configuration.editor.layoutInfo.contentLeft;

		this.domNode.setClassName(editorBrowser.ClassNames.MARGIN_VIEW_OVERLAYS + ' monaco-editor-background');
		this.domNode.setWidth(1);
	}

	protected _extraDomNodeHTML(): string {
		return [
			'<div class="',
			editorBrowser.ClassNames.GLYPH_MARGIN,
			'" style="left:',
			String(this._glyphMarginLeft),
			'px;width:',
			String(this._glyphMarginWidth),
			'px;height:',
			String(this._scrollHeight),
			'px;"></div>'
		].join('');
	}

	private _getGlyphMarginDomNode(): HTMLElement {
		return <HTMLElement>this.domNode.domNode.children[0];
	}

	public onScrollHeightChanged(scrollHeight:number): boolean {
		this._scrollHeight = scrollHeight;
		return super.onScrollHeightChanged(scrollHeight) || true;
	}

	public onLayoutChanged(layoutInfo:IEditorLayoutInfo): boolean {
		this._glyphMarginLeft = layoutInfo.glyphMarginLeft;
		this._glyphMarginWidth = layoutInfo.glyphMarginWidth;
		this._scrollHeight = this._layoutProvider.getScrollHeight();
		this._contentLeft = layoutInfo.contentLeft;
		return super.onLayoutChanged(layoutInfo) || true;
	}

	_viewOverlaysRender(ctx:editorBrowser.IRestrictedRenderingContext): void {
		super._viewOverlaysRender(ctx);
		if (browser.canUseTranslate3d) {
			var transform = 'translate3d(0px, ' + ctx.linesViewportData.visibleRangesDeltaTop + 'px, 0px)';
			this.domNode.setTransform(transform);
		} else {
			this.domNode.setTop(ctx.linesViewportData.visibleRangesDeltaTop);
		}
		var height = Math.min(this._layoutProvider.getTotalHeight(), 1000000);
		this.domNode.setHeight(height);
		this.domNode.setWidth(this._contentLeft);

		var glyphMargin = this._getGlyphMarginDomNode();
		if (glyphMargin) {
			StyleMutator.setHeight(glyphMargin, this._scrollHeight);
			StyleMutator.setLeft(glyphMargin, this._glyphMarginLeft);
			StyleMutator.setWidth(glyphMargin, this._glyphMarginWidth);
		}
	}
}