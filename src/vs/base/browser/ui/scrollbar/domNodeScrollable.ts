/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as DomUtils from 'vs/base/browser/dom';
import {Gesture} from 'vs/base/browser/touch';
import {Disposable, IDisposable} from 'vs/base/common/lifecycle';
import {IScrollable, ScrollEvent} from 'vs/base/common/scrollable';
import {Emitter} from 'vs/base/common/event';

export class DomNodeScrollable extends Disposable implements IScrollable {

	private _domNode: HTMLElement;
	private _gestureHandler: Gesture;
	private _onScroll = this._register(new Emitter<ScrollEvent>());

	private _lastScrollTop:number;
	private _lastScrollLeft:number;

	constructor(domNode: HTMLElement) {
		super();
		this._domNode = domNode;
		this._gestureHandler = this._register(new Gesture(this._domNode));

		this._lastScrollTop = this.getScrollTop();
		this._lastScrollLeft = this.getScrollLeft();

		this._register(DomUtils.addDisposableListener(this._domNode, 'scroll', (e) => {
			this._emitScrollEvent();
		}));
	}

	public onContentsDimensions(): void {
		this._emitScrollEvent();
	}

	private _emitScrollEvent(): void {
		let vertical = (this._lastScrollTop !== this.getScrollTop());
		this._lastScrollTop = this.getScrollTop();

		let horizontal = (this._lastScrollLeft !== this.getScrollLeft());
		this._lastScrollLeft = this.getScrollLeft();

		this._onScroll.fire(new ScrollEvent(
			this.getScrollTop(),
			this.getScrollLeft(),
			this.getScrollWidth(),
			this.getScrollHeight(),
			vertical,
			horizontal
		));
	}

	public dispose() {
		this._domNode = null;
		super.dispose();
	}

	public getScrollHeight(): number {
		return this._domNode.scrollHeight;
	}

	public getScrollWidth(): number {
		return this._domNode.scrollWidth;
	}

	public getScrollLeft(): number {
		return this._domNode.scrollLeft;
	}

	public setScrollLeft(scrollLeft: number): void {
		this._domNode.scrollLeft = scrollLeft;
	}

	public getScrollTop(): number {
		return this._domNode.scrollTop;
	}

	public setScrollTop(scrollTop: number): void {
		this._domNode.scrollTop = scrollTop;
	}

	public addScrollListener(callback: (v:ScrollEvent) => void): IDisposable {
		return this._onScroll.event(callback);
	}
}
