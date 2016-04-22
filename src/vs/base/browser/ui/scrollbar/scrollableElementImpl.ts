/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import 'vs/css!./media/scrollbars';

import * as DomUtils from 'vs/base/browser/dom';
import * as Platform from 'vs/base/common/platform';
import {StandardMouseWheelEvent, IMouseEvent} from 'vs/base/browser/mouseEvent';
import {HorizontalScrollbar} from 'vs/base/browser/ui/scrollbar/horizontalScrollbar';
import {VerticalScrollbar} from 'vs/base/browser/ui/scrollbar/verticalScrollbar';
import {
		IScrollableElementOptions, IScrollbar, IDimensions, IMouseWheelEvent, visibilityFromString,
		IScrollableElement, IScrollableElementCreationOptions, IOverviewRulerLayoutInfo
	} from 'vs/base/browser/ui/scrollbar/scrollableElement';
import {IDisposable, dispose} from 'vs/base/common/lifecycle';
import {IScrollable, DelegateScrollable} from 'vs/base/common/scrollable';
import {Widget} from 'vs/base/browser/ui/widget';
import {TimeoutTimer} from 'vs/base/common/async';
import {FastDomNode, createFastDomNode} from 'vs/base/browser/styleMutator';

const HIDE_TIMEOUT = 500;
const SCROLL_WHEEL_SENSITIVITY = 50;

export class ScrollableElement extends Widget implements IScrollableElement {

	private _options: IScrollableElementOptions;
	private _scrollable: DelegateScrollable;
	public verticalScrollbarWidth: number;
	public horizontalScrollbarHeight: number;
	private _verticalScrollbar: IScrollbar;
	private _horizontalScrollbar: IScrollbar;
	private _domNode: HTMLElement;

	private _leftShadowDomNode: FastDomNode;
	private _topShadowDomNode: FastDomNode;
	private _topLeftShadowDomNode: FastDomNode;

	private _listenOnDomNode: HTMLElement;

	private _mouseWheelToDispose: IDisposable[];

	private _onElementDimensionsTimeout: TimeoutTimer;
	private _isDragging: boolean;
	private _mouseIsOver: boolean;

	private _hideTimeout: TimeoutTimer;
	private _shouldRender: boolean;

	constructor(element: HTMLElement, scrollable:IScrollable, options: IScrollableElementCreationOptions, dimensions: IDimensions = null) {
		super();
		element.style.overflow = 'hidden';
		this._options = this._createOptions(options);

		this._scrollable = this._register(new DelegateScrollable(scrollable, () => this._onScroll()));

		this.verticalScrollbarWidth = this._options.verticalScrollbarSize;
		this.horizontalScrollbarHeight = this._options.horizontalScrollbarSize;

		this._verticalScrollbar = this._register(new VerticalScrollbar(this._scrollable, this, this._options));
		this._horizontalScrollbar = this._register(new HorizontalScrollbar(this._scrollable, this, this._options));

		this._domNode = document.createElement('div');
		this._domNode.className = 'monaco-scrollable-element ' + this._options.className;
		this._domNode.setAttribute('role', 'presentation');
		this._domNode.style.position = 'relative';
		this._domNode.style.overflow = 'hidden';
		this._domNode.appendChild(element);
		this._domNode.appendChild(this._horizontalScrollbar.domNode.domNode);
		this._domNode.appendChild(this._verticalScrollbar.domNode.domNode);

		if (this._options.useShadows) {
			this._leftShadowDomNode = createFastDomNode(document.createElement('div'));
			this._leftShadowDomNode.setClassName('shadow');
			this._domNode.appendChild(this._leftShadowDomNode.domNode);

			this._topShadowDomNode = createFastDomNode(document.createElement('div'));
			this._topShadowDomNode.setClassName('shadow');
			this._domNode.appendChild(this._topShadowDomNode.domNode);

			this._topLeftShadowDomNode = createFastDomNode(document.createElement('div'));
			this._topLeftShadowDomNode.setClassName('shadow top-left-corner');
			this._domNode.appendChild(this._topLeftShadowDomNode.domNode);
		}

		this._listenOnDomNode = this._options.listenOnDomNode || this._domNode;

		this._mouseWheelToDispose = [];
		this._setListeningToMouseWheel(this._options.handleMouseWheel);

		this.onmouseover(this._listenOnDomNode, (e) => this._onMouseOver(e));
		this.onnonbubblingmouseout(this._listenOnDomNode, (e) => this._onMouseOut(e));

		this._onElementDimensionsTimeout = this._register(new TimeoutTimer());
		this._hideTimeout = this._register(new TimeoutTimer());
		this._isDragging = false;
		this._mouseIsOver = false;

		this.onElementDimensions(dimensions, true);

		this._shouldRender = true;
		this._shouldRender = this._horizontalScrollbar.onElementScrollSize(this._scrollable.getScrollWidth()) || this._shouldRender;
		this._shouldRender = this._verticalScrollbar.onElementScrollSize(this._scrollable.getScrollHeight()) || this._shouldRender;
	}

	public dispose(): void {
		this._mouseWheelToDispose = dispose(this._mouseWheelToDispose);
		super.dispose();
	}

	public getDomNode(): HTMLElement {
		return this._domNode;
	}

	public getOverviewRulerLayoutInfo(): IOverviewRulerLayoutInfo {
		return {
			parent: this._domNode,
			insertBefore: this._verticalScrollbar.domNode.domNode,
		};
	}

	public delegateVerticalScrollbarMouseDown(browserEvent: MouseEvent): void {
		this._verticalScrollbar.delegateMouseDown(browserEvent);
	}

	public onElementDimensions(dimensions: IDimensions = null, synchronous: boolean = false): void {
		if (synchronous) {
			this._actualElementDimensions(dimensions);
			this._onElementDimensionsTimeout.cancel();
		} else {
			this._onElementDimensionsTimeout.cancelAndSet(() => this._actualElementDimensions(dimensions), 0);
		}
	}

	private _actualElementDimensions(dimensions: IDimensions = null): void {
		if (!dimensions) {
			dimensions = {
				width: this._domNode.clientWidth,
				height: this._domNode.clientHeight
			};
		}
		let width = Math.round(dimensions.width);
		let height = Math.round(dimensions.height);
		this._shouldRender = this._verticalScrollbar.onElementSize(height) || this._shouldRender;
		this._shouldRender = this._horizontalScrollbar.onElementSize(width) || this._shouldRender;
	}

	public updateClassName(newClassName: string): void {
		this._options.className = newClassName;
		// Defaults are different on Macs
		if (Platform.isMacintosh) {
			this._options.className += ' mac';
		}
		this._domNode.className = 'monaco-scrollable-element ' + this._options.className;
	}

	public updateOptions(newOptions: IScrollableElementCreationOptions): void {
		// only support handleMouseWheel changes for now
		let massagedOptions = this._createOptions(newOptions);
		this._options.handleMouseWheel = massagedOptions.handleMouseWheel;
		this._options.mouseWheelScrollSensitivity = massagedOptions.mouseWheelScrollSensitivity;
		this._setListeningToMouseWheel(this._options.handleMouseWheel);
	}

	// -------------------- mouse wheel scrolling --------------------

	private _setListeningToMouseWheel(shouldListen: boolean): void {
		let isListening = (this._mouseWheelToDispose.length > 0);

		if (isListening === shouldListen) {
			// No change
			return;
		}

		// Stop listening (if necessary)
		this._mouseWheelToDispose = dispose(this._mouseWheelToDispose);

		// Start listening (if necessary)
		if (shouldListen) {
			let onMouseWheel = (browserEvent: MouseWheelEvent) => {
				let e = new StandardMouseWheelEvent(browserEvent);
				this.onMouseWheel(e);
			};

			this._mouseWheelToDispose.push(DomUtils.addDisposableListener(this._listenOnDomNode, 'mousewheel', onMouseWheel));
			this._mouseWheelToDispose.push(DomUtils.addDisposableListener(this._listenOnDomNode, 'DOMMouseScroll', onMouseWheel));
		}
	}

	public onMouseWheel(e: IMouseWheelEvent): void {
		if (Platform.isMacintosh && e.browserEvent && this._options.saveLastScrollTimeOnClassName) {
			// Mark dom node with timestamp of wheel event
			let target = <HTMLElement>e.browserEvent.target;
			if (target && target.nodeType === 1) {
				let r = DomUtils.findParentWithClass(target, this._options.saveLastScrollTimeOnClassName);
				if (r) {
					r.setAttribute('last-scroll-time', String(new Date().getTime()));
				}
			}
		}

		let desiredScrollTop = -1;
		let desiredScrollLeft = -1;

		if (e.deltaY || e.deltaX) {
			let deltaY = e.deltaY * this._options.mouseWheelScrollSensitivity;
			let deltaX = e.deltaX * this._options.mouseWheelScrollSensitivity;

			if (this._options.flipAxes) {
				deltaY = e.deltaX;
				deltaX = e.deltaY;
			}

			if (Platform.isMacintosh) {
				// Give preference to vertical scrolling
				if (deltaY && Math.abs(deltaX) < 0.2) {
					deltaX = 0;
				}
				if (Math.abs(deltaY) > Math.abs(deltaX) * 0.5) {
					deltaX = 0;
				}
			}

			if (deltaY) {
				let currentScrollTop = this._scrollable.getScrollTop();
				desiredScrollTop = this._verticalScrollbar.validateScrollPosition((desiredScrollTop !== -1 ? desiredScrollTop : currentScrollTop) - SCROLL_WHEEL_SENSITIVITY * deltaY);
				if (desiredScrollTop === currentScrollTop) {
					desiredScrollTop = -1;
				}
			}
			if (deltaX) {
				let currentScrollLeft = this._scrollable.getScrollLeft();
				desiredScrollLeft = this._horizontalScrollbar.validateScrollPosition((desiredScrollLeft !== -1 ? desiredScrollLeft : currentScrollLeft) - SCROLL_WHEEL_SENSITIVITY * deltaX);
				if (desiredScrollLeft === currentScrollLeft) {
					desiredScrollLeft = -1;
				}
			}

			if (desiredScrollTop !== -1 || desiredScrollLeft !== -1) {
				if (desiredScrollTop !== -1) {
					this._shouldRender = this._verticalScrollbar.setDesiredScrollPosition(desiredScrollTop) || this._shouldRender;
					desiredScrollTop = -1;
				}
				if (desiredScrollLeft !== -1) {
					this._shouldRender = this._horizontalScrollbar.setDesiredScrollPosition(desiredScrollLeft) || this._shouldRender;
					desiredScrollLeft = -1;
				}
			}
		}

		e.preventDefault();
		e.stopPropagation();
	}

	private _onScroll(): void {
		let scrollHeight = this._scrollable.getScrollHeight();
		let scrollTop = this._scrollable.getScrollTop();
		let scrollWidth = this._scrollable.getScrollWidth();
		let scrollLeft = this._scrollable.getScrollLeft();

		this._shouldRender = this._horizontalScrollbar.onElementScrollSize(scrollWidth) || this._shouldRender;
		this._shouldRender = this._verticalScrollbar.onElementScrollSize(scrollHeight) || this._shouldRender;
		this._shouldRender = this._verticalScrollbar.onElementScrollPosition(scrollTop) || this._shouldRender;
		this._shouldRender = this._horizontalScrollbar.onElementScrollPosition(scrollLeft) || this._shouldRender;

		if (this._options.useShadows) {
			this._shouldRender = true;
		}

		this._reveal();

		if (!this._options.lazyRender) {
			this._render();
		}
	}

	public renderNow(): void {
		if (!this._options.lazyRender) {
			throw new Error('Please use `lazyRender` together with `renderNow`!');
		}

		this._render();
	}

	private _render(): void {
		if (!this._shouldRender) {
			return;
		}

		this._shouldRender = false;

		this._horizontalScrollbar.render();
		this._verticalScrollbar.render();

		if (this._options.useShadows) {
			let enableTop = this._scrollable.getScrollTop() > 0;
			let enableLeft = this._scrollable.getScrollLeft() > 0;

			this._leftShadowDomNode.setClassName('shadow' + (enableLeft ? ' left' : ''));
			this._topShadowDomNode.setClassName('shadow' + (enableTop ? ' top' : ''));
			this._topLeftShadowDomNode.setClassName('shadow top-left-corner' + (enableTop ? ' top' : '') + (enableLeft ? ' left' : ''));
		}
	}

	// -------------------- fade in / fade out --------------------

	public onDragStart(): void {
		this._isDragging = true;
		this._reveal();
	}

	public onDragEnd(): void {
		this._isDragging = false;
		this._hide();
	}

	private _onMouseOut(e: IMouseEvent): void {
		this._mouseIsOver = false;
		this._hide();
	}

	private _onMouseOver(e: IMouseEvent): void {
		this._mouseIsOver = true;
		this._reveal();
	}

	private _reveal(): void {
		this._verticalScrollbar.beginReveal();
		this._horizontalScrollbar.beginReveal();
		this._scheduleHide();
	}

	private _hide(): void {
		if (!this._mouseIsOver && !this._isDragging) {
			this._verticalScrollbar.beginHide();
			this._horizontalScrollbar.beginHide();
		}
	}

	private _scheduleHide(): void {
		this._hideTimeout.cancelAndSet(() => this._hide(), HIDE_TIMEOUT);
	}

	// -------------------- size & layout --------------------

	private _createOptions(options: IScrollableElementCreationOptions): IScrollableElementOptions {

		function ensureValue<V>(source: any, prop: string, value: V) {
			if (source.hasOwnProperty(prop)) {
				return <V>source[prop];
			}
			return value;
		}

		let result: IScrollableElementOptions = {
			forbidTranslate3dUse: ensureValue(options, 'forbidTranslate3dUse', false),
			lazyRender: ensureValue(options, 'lazyRender', false),
			className: ensureValue(options, 'className', ''),
			useShadows: ensureValue(options, 'useShadows', true),
			handleMouseWheel: ensureValue(options, 'handleMouseWheel', true),
			flipAxes: ensureValue(options, 'flipAxes', false),
			mouseWheelScrollSensitivity: ensureValue(options, 'mouseWheelScrollSensitivity', 1),
			arrowSize: ensureValue(options, 'arrowSize', 11),

			listenOnDomNode: ensureValue<HTMLElement>(options, 'listenOnDomNode', null),

			horizontal: visibilityFromString(ensureValue(options, 'horizontal', 'auto')),
			horizontalScrollbarSize: ensureValue(options, 'horizontalScrollbarSize', 10),
			horizontalSliderSize: 0,
			horizontalHasArrows: ensureValue(options, 'horizontalHasArrows', false),

			vertical: visibilityFromString(ensureValue(options, 'vertical', 'auto')),
			verticalScrollbarSize: ensureValue(options, 'verticalScrollbarSize', 10),
			verticalHasArrows: ensureValue(options, 'verticalHasArrows', false),
			verticalSliderSize: 0,

			saveLastScrollTimeOnClassName: ensureValue(options, 'saveLastScrollTimeOnClassName', null)
		};

		result.horizontalSliderSize = ensureValue(options, 'horizontalSliderSize', result.horizontalScrollbarSize);
		result.verticalSliderSize = ensureValue(options, 'verticalSliderSize', result.verticalScrollbarSize);

		// Defaults are different on Macs
		if (Platform.isMacintosh) {
			result.className += ' mac';
		}

		return result;
	}
}
