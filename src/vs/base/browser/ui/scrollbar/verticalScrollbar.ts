/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as Browser from 'vs/base/browser/browser';
import {ARROW_IMG_SIZE, AbstractScrollbar, ScrollbarState, IMouseMoveEventData} from 'vs/base/browser/ui/scrollbar/abstractScrollbar';
import {IMouseEvent, StandardMouseWheelEvent} from 'vs/base/browser/mouseEvent';
import {IDomNodePosition} from 'vs/base/browser/dom';
import {IParent, IScrollableElementOptions, Visibility} from 'vs/base/browser/ui/scrollbar/scrollableElement';
import {DelegateScrollable} from 'vs/base/common/scrollable';

export class VerticalScrollbar extends AbstractScrollbar {

	private _scrollable: DelegateScrollable;

	constructor(scrollable: DelegateScrollable, parent: IParent, options: IScrollableElementOptions) {
		let s = new ScrollbarState(
			(options.verticalHasArrows ? options.arrowSize : 0),
			(options.vertical === Visibility.Hidden ? 0 : options.verticalScrollbarSize),
			// give priority to vertical scroll bar over horizontal and let it scroll all the way to the bottom
			0
		);
		super(options.forbidTranslate3dUse, options.lazyRender, parent, s, options.vertical, 'vertical');
		this._scrollable = scrollable;

		this._createDomNode();
		if (options.verticalHasArrows) {
			let arrowDelta = (options.arrowSize - ARROW_IMG_SIZE) / 2;
			let scrollbarDelta = (options.verticalScrollbarSize - ARROW_IMG_SIZE) / 2;

			this._createArrow('up-arrow', arrowDelta, scrollbarDelta, null, null, options.verticalScrollbarSize, options.arrowSize, () => this._createMouseWheelEvent(1));
			this._createArrow('down-arrow', null, scrollbarDelta, arrowDelta, null, options.verticalScrollbarSize, options.arrowSize, () => this._createMouseWheelEvent(-1));
		}

		this._createSlider(0, Math.floor((options.verticalScrollbarSize - options.verticalSliderSize) / 2), options.verticalSliderSize, null);
	}

	protected _createMouseWheelEvent(sign: number) {
		return new StandardMouseWheelEvent(null, 0, sign);
	}

	protected _updateSlider(sliderSize: number, sliderPosition: number): void {
		this.slider.setHeight(sliderSize);
		if (!this._forbidTranslate3dUse && Browser.canUseTranslate3d) {
			this.slider.setTransform('translate3d(0px, ' + sliderPosition + 'px, 0px)');
		} else {
			this.slider.setTop(sliderPosition);
		}
	}

	protected _renderDomNode(largeSize: number, smallSize: number): void {
		this.domNode.setWidth(smallSize);
		this.domNode.setHeight(largeSize);
		this.domNode.setRight(0);
		this.domNode.setTop(0);
	}

	protected _mouseDownRelativePosition(e: IMouseEvent, domNodePosition: IDomNodePosition): number {
		return e.posy - domNodePosition.top;
	}

	protected _sliderMousePosition(e: IMouseMoveEventData): number {
		return e.posy;
	}

	protected _sliderOrthogonalMousePosition(e: IMouseMoveEventData): number {
		return e.posx;
	}

	protected _getScrollPosition(): number {
		return this._scrollable.getScrollTop();
	}

	protected _setScrollPosition(scrollPosition: number): void {
		this._scrollable.setScrollTop(scrollPosition);
	}
}
