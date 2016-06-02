/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import URI from 'vs/base/common/uri';
import winjs = require('vs/base/common/winjs.base');
import editorCommon = require('vs/editor/common/editorCommon');
import modes = require('vs/editor/common/modes');
import htmlWorker = require('vs/languages/html/common/htmlWorker');
import { AbstractMode, createWordRegExp, ModeWorkerManager } from 'vs/editor/common/modes/abstractMode';
import { AbstractState } from 'vs/editor/common/modes/abstractState';
import {OneWorkerAttr, AllWorkersAttr} from 'vs/platform/thread/common/threadService';
import {IModeService} from 'vs/editor/common/services/modeService';
import {IInstantiationService} from 'vs/platform/instantiation/common/instantiation';
import * as htmlTokenTypes from 'vs/languages/html/common/htmlTokenTypes';
import {EMPTY_ELEMENTS} from 'vs/languages/html/common/htmlEmptyTagsShared';
import {RichEditSupport} from 'vs/editor/common/modes/supports/richEditSupport';
import {TokenizationSupport, IEnteringNestedModeData, ILeavingNestedModeData, ITokenizationCustomization} from 'vs/editor/common/modes/supports/tokenizationSupport';
import {IThreadService} from 'vs/platform/thread/common/thread';
import {wireCancellationToken} from 'vs/base/common/async';

export { htmlTokenTypes }; // export to be used by Razor. We are the main module, so Razor should get it from us.
export { EMPTY_ELEMENTS }; // export to be used by Razor. We are the main module, so Razor should get it from us.

export enum States {
	Content,
	OpeningStartTag,
	OpeningEndTag,
	WithinDoctype,
	WithinTag,
	WithinComment,
	WithinEmbeddedContent,
	AttributeName,
	AttributeValue
}

// list of elements that embed other content
var tagsEmbeddingContent:string[] = ['script', 'style'];



export class State extends AbstractState {
	public kind:States;
	public lastTagName:string;
	public lastAttributeName:string;
	public embeddedContentType:string;
	public attributeValueQuote:string;
	public attributeValue:string;

	constructor(mode:modes.IMode, kind:States, lastTagName:string, lastAttributeName:string, embeddedContentType:string, attributeValueQuote:string, attributeValue:string) {
		super(mode);
		this.kind = kind;
		this.lastTagName = lastTagName;
		this.lastAttributeName = lastAttributeName;
		this.embeddedContentType = embeddedContentType;
		this.attributeValueQuote = attributeValueQuote;
		this.attributeValue = attributeValue;
	}

	static escapeTagName(s:string):string {
		return htmlTokenTypes.getTag(s.replace(/[:_.]/g, '-'));
	}

	public makeClone():State {
		return new State(this.getMode(), this.kind, this.lastTagName, this.lastAttributeName, this.embeddedContentType, this.attributeValueQuote, this.attributeValue);
	}

	public equals(other:modes.IState):boolean {
		if (other instanceof State) {
			return (
				super.equals(other) &&
				this.kind === other.kind &&
				this.lastTagName === other.lastTagName &&
				this.lastAttributeName === other.lastAttributeName &&
				this.embeddedContentType === other.embeddedContentType &&
				this.attributeValueQuote === other.attributeValueQuote &&
				this.attributeValue === other.attributeValue
			);
		}
		return false;
	}

	private nextElementName(stream:modes.IStream):string {
		return stream.advanceIfRegExp(/^[_:\w][_:\w-.\d]*/).toLowerCase();
	}

	private nextAttributeName(stream:modes.IStream):string {
		return stream.advanceIfRegExp(/^[^\s"'>/=\x00-\x0F\x7F\x80-\x9F]*/).toLowerCase();
	}

	public tokenize(stream:modes.IStream) : modes.ITokenizationResult {

		switch(this.kind){
			case States.WithinComment:
				if (stream.advanceUntilString2('-->', false)) {
					return { type: htmlTokenTypes.COMMENT};

				} else if(stream.advanceIfString2('-->')) {
					this.kind = States.Content;
					return { type: htmlTokenTypes.DELIM_COMMENT, dontMergeWithPrev: true };
				}
				break;

			case States.WithinDoctype:
				if (stream.advanceUntilString2('>', false)) {
					return { type: htmlTokenTypes.DOCTYPE};
				} else if(stream.advanceIfString2('>')) {
					this.kind = States.Content;
					return { type: htmlTokenTypes.DELIM_DOCTYPE, dontMergeWithPrev: true };
				}
			break;

			case States.Content:
				if (stream.advanceIfCharCode2('<'.charCodeAt(0))) {
					if (!stream.eos() && stream.peek() === '!') {
						if (stream.advanceIfString2('!--')) {
							this.kind = States.WithinComment;
							return { type: htmlTokenTypes.DELIM_COMMENT, dontMergeWithPrev: true };
						}
						if (stream.advanceIfStringCaseInsensitive2('!DOCTYPE')) {
							this.kind = States.WithinDoctype;
							return { type: htmlTokenTypes.DELIM_DOCTYPE, dontMergeWithPrev: true };
						}
					}
					if (stream.advanceIfCharCode2('/'.charCodeAt(0))) {
						this.kind = States.OpeningEndTag;
						return { type: htmlTokenTypes.DELIM_END, dontMergeWithPrev: true };
					}
					this.kind = States.OpeningStartTag;
					return { type: htmlTokenTypes.DELIM_START, dontMergeWithPrev: true };
				}
				break;

			case States.OpeningEndTag:
				var tagName = this.nextElementName(stream);
				if (tagName.length > 0){
					return {
						type: State.escapeTagName(tagName),
					};

				} else if (stream.advanceIfString2('>')) {
					this.kind = States.Content;
					return { type: htmlTokenTypes.DELIM_END, dontMergeWithPrev: true };

				} else {
					stream.advanceUntilString2('>', false);
					return { type: '' };
				}

			case States.OpeningStartTag:
				this.lastTagName = this.nextElementName(stream);
				if (this.lastTagName.length > 0) {
					this.lastAttributeName = null;
					if ('script' === this.lastTagName || 'style' === this.lastTagName) {
						this.lastAttributeName = null;
						this.embeddedContentType = null;
					}
					this.kind = States.WithinTag;
					return {
						type: State.escapeTagName(this.lastTagName),
					};
				}
				break;

			case States.WithinTag:
				if (stream.skipWhitespace2() || stream.eos()) {
					this.lastAttributeName = ''; // remember that we have seen a whitespace
					return { type: '' };
				} else {
					if (this.lastAttributeName === '') {
						var name = this.nextAttributeName(stream);
						if (name.length > 0) {
							this.lastAttributeName = name;
							this.kind = States.AttributeName;
							return { type: htmlTokenTypes.ATTRIB_NAME };
						}
					}
					if (stream.advanceIfString2('/>')) {
						this.kind = States.Content;
						return { type: htmlTokenTypes.DELIM_START, dontMergeWithPrev: true };
					}
					if (stream.advanceIfCharCode2('>'.charCodeAt(0))) {
						if (tagsEmbeddingContent.indexOf(this.lastTagName) !== -1) {
							this.kind = States.WithinEmbeddedContent;
							return { type: htmlTokenTypes.DELIM_START, dontMergeWithPrev: true };
						} else {
							this.kind = States.Content;
							return { type: htmlTokenTypes.DELIM_START, dontMergeWithPrev: true };
						}
					} else {
						stream.next2();
						return { type: '' };
					}
				}

			case States.AttributeName:
				if (stream.skipWhitespace2() || stream.eos()){
					return { type: '' };
				}

				if (stream.advanceIfCharCode2('='.charCodeAt(0))) {
					this.kind = States.AttributeValue;
					return { type: htmlTokenTypes.DELIM_ASSIGN };
				} else {
					this.kind = States.WithinTag;
					this.lastAttributeName = '';
					return this.tokenize(stream); // no advance yet - jump to WithinTag
				}

			case States.AttributeValue:
				if (stream.eos()) {
					return { type: '' };
				}
				if(stream.skipWhitespace2()) {
					if (this.attributeValueQuote === '"' || this.attributeValueQuote === '\'') {
						// We are inside the quotes of an attribute value
						return { type: htmlTokenTypes.ATTRIB_VALUE };
					}
					return { type: '' };
				}
				// We are in a attribute value
				if (this.attributeValueQuote === '"' || this.attributeValueQuote === '\'') {

					if (this.attributeValue === this.attributeValueQuote && ('script' === this.lastTagName || 'style' === this.lastTagName) && 'type' === this.lastAttributeName) {
						this.attributeValue = stream.advanceUntilString(this.attributeValueQuote, true);
						if (this.attributeValue.length > 0) {
							this.embeddedContentType = this.unquote(this.attributeValue);
							this.kind = States.WithinTag;
							this.attributeValue = '';
							this.attributeValueQuote = '';
							return { type: htmlTokenTypes.ATTRIB_VALUE };
						}
					} else {
						if (stream.advanceIfCharCode2(this.attributeValueQuote.charCodeAt(0))) {
							this.kind = States.WithinTag;
							this.attributeValue = '';
							this.attributeValueQuote = '';
							this.lastAttributeName = null;
						} else {
							var part = stream.next();
							this.attributeValue += part;
						}
						return { type: htmlTokenTypes.ATTRIB_VALUE };
					}
				} else {
					let attributeValue = stream.advanceIfRegExp(/^[^\s"'`=<>]+/);
					if (attributeValue.length > 0) {
						this.kind = States.WithinTag;
						this.lastAttributeName = null;
						return { type: htmlTokenTypes.ATTRIB_VALUE };
					}
					var ch = stream.peek();
					if (ch === '\'' || ch === '"') {
						this.attributeValueQuote = ch;
						this.attributeValue = ch;
						stream.next2();
						return { type: htmlTokenTypes.ATTRIB_VALUE };
					} else {
						this.kind = States.WithinTag;
						this.lastAttributeName = null;
						return this.tokenize(stream); // no advance yet - jump to WithinTag
					}
				}
		}

		stream.next2();
		this.kind = States.Content;
		return { type: '' };
	}

	private unquote(value:string):string {
		var start = 0;
		var end = value.length;
		if ('"' === value[0]) {
			start++;
		}
		if ('"' === value[end - 1]) {
			end--;
		}
		return value.substring(start, end);
	}
}

export class HTMLMode<W extends htmlWorker.HTMLWorker> extends AbstractMode implements ITokenizationCustomization {

	public tokenizationSupport: modes.ITokenizationSupport;
	public richEditSupport: modes.IRichEditSupport;
	public configSupport: modes.IConfigurationSupport;

	private modeService:IModeService;
	private threadService:IThreadService;
	private _modeWorkerManager: ModeWorkerManager<W>;

	constructor(
		descriptor:modes.IModeDescriptor,
		@IInstantiationService instantiationService: IInstantiationService,
		@IModeService modeService: IModeService,
		@IThreadService threadService: IThreadService
	) {
		super(descriptor.id);
		this._modeWorkerManager = this._createModeWorkerManager(descriptor, instantiationService);

		this.modeService = modeService;
		this.threadService = threadService;

		this.tokenizationSupport = new TokenizationSupport(this, this, true, true);
		this.configSupport = this;

		this.richEditSupport = this._createRichEditSupport();

		this._registerSupports();
	}

	public asyncCtor(): winjs.Promise {
		return winjs.Promise.join([
			this.modeService.getOrCreateMode('text/css'),
			this.modeService.getOrCreateMode('text/javascript'),
		]);
	}

	protected _registerSupports(): void {
		if (this.getId() !== 'html') {
			throw new Error('This method must be overwritten!');
		}

		modes.HoverProviderRegistry.register(this.getId(), {
			provideHover: (model, position, token): Thenable<modes.Hover> => {
				return wireCancellationToken(token, this._provideHover(model.uri, position));
			}
		}, true);

		modes.ReferenceProviderRegistry.register(this.getId(), {
			provideReferences: (model, position, context, token): Thenable<modes.Location[]> => {
				return wireCancellationToken(token, this._provideReferences(model.uri, position, context));
			}
		}, true);

		modes.SuggestRegistry.register(this.getId(), {
			triggerCharacters: ['.', ':', '<', '"', '=', '/'],
			shouldAutotriggerSuggest: true,
			provideCompletionItems: (model, position, token): Thenable<modes.ISuggestResult[]> => {
				return wireCancellationToken(token, this._provideCompletionItems(model.uri, position));
			}
		}, true);

		modes.DocumentHighlightProviderRegistry.register(this.getId(), {
			provideDocumentHighlights: (model, position, token): Thenable<modes.DocumentHighlight[]> => {
				return wireCancellationToken(token, this._provideDocumentHighlights(model.uri, position));
			}
		}, true);

		modes.DocumentRangeFormattingEditProviderRegistry.register(this.getId(), {
			provideDocumentRangeFormattingEdits: (model, range, options, token): Thenable<editorCommon.ISingleEditOperation[]> => {
				return wireCancellationToken(token, this._provideDocumentRangeFormattingEdits(model.uri, range, options));
			}
		}, true);

		modes.LinkProviderRegistry.register(this.getId(), {
			provideLinks: (model, token): Thenable<modes.ILink[]> => {
				return wireCancellationToken(token, this._provideLinks(model.uri));
			}
		}, true);
	}

	protected _createModeWorkerManager(descriptor:modes.IModeDescriptor, instantiationService: IInstantiationService): ModeWorkerManager<W> {
		return new ModeWorkerManager<W>(descriptor, 'vs/languages/html/common/htmlWorker', 'HTMLWorker', null, instantiationService);
	}

	private _worker<T>(runner:(worker:W)=>winjs.TPromise<T>): winjs.TPromise<T> {
		return this._modeWorkerManager.worker(runner);
	}

	protected _createRichEditSupport(): modes.IRichEditSupport {
		return new RichEditSupport(this.getId(), null, {

			wordPattern: createWordRegExp('#-?%'),

			comments: {
				blockComment: ['<!--', '-->']
			},

			brackets: [
				['<!--', '-->'],
				['<', '>'],
			],

			__electricCharacterSupport: {
				caseInsensitive: true,
				embeddedElectricCharacters: ['*', '}', ']', ')']
			},

			autoClosingPairs: [
				{ open: '{', close: '}' },
				{ open: '[', close: ']' },
				{ open: '(', close: ')' },
				{ open: '"', close: '"' },
				{ open: '\'', close: '\'' }
			],
			
			surroundingPairs: [
				{ open: '"', close: '"' },
				{ open: '\'', close: '\'' }
			],

			onEnterRules: [
				{
					beforeText: new RegExp(`<(?!(?:${EMPTY_ELEMENTS.join('|')}))([_:\\w][_:\\w-.\\d]*)([^/>]*(?!/)>)[^<]*$`, 'i'),
					afterText: /^<\/([_:\w][_:\w-.\d]*)\s*>$/i,
					action: { indentAction: modes.IndentAction.IndentOutdent }
				},
				{
					beforeText: new RegExp(`<(?!(?:${EMPTY_ELEMENTS.join('|')}))(\\w[\\w\\d]*)([^/>]*(?!/)>)[^<]*$`, 'i'),
					action: { indentAction: modes.IndentAction.Indent }
				}
			],
		});
	}

	// TokenizationSupport

	public getInitialState():modes.IState {
		return new State(this, States.Content, '', '', '', '', '');
	}

	public enterNestedMode(state:modes.IState):boolean {
		return state instanceof State && (<State>state).kind === States.WithinEmbeddedContent;
	}

	public getNestedMode(state:modes.IState): IEnteringNestedModeData {
		var result:modes.IMode = null;
		var htmlState:State = <State>state;
		var missingModePromise: winjs.Promise = null;

		if (htmlState.embeddedContentType !== null) {
			if (this.modeService.isRegisteredMode(htmlState.embeddedContentType)) {
				result = this.modeService.getMode(htmlState.embeddedContentType);
				if (!result) {
					missingModePromise = this.modeService.getOrCreateMode(htmlState.embeddedContentType);
				}
			}
		} else {
			var mimeType:string = null;
			if ('script' === htmlState.lastTagName) {
				mimeType = 'text/javascript';
			} else if ('style' === htmlState.lastTagName) {
				mimeType = 'text/css';
			} else {
				mimeType = 'text/plain';
			}
			result = this.modeService.getMode(mimeType);
		}
		if (result === null) {
			result = this.modeService.getMode('text/plain');
		}
		return {
			mode: result,
			missingModePromise: missingModePromise
		};
	}

	public getLeavingNestedModeData(line:string, state:modes.IState):ILeavingNestedModeData {
		var tagName = (<State>state).lastTagName;
		var regexp = new RegExp('<\\/' + tagName + '\\s*>', 'i');
		var match:any = regexp.exec(line);
		if (match !== null) {
			return {
				nestedModeBuffer: line.substring(0, match.index),
				bufferAfterNestedMode: line.substring(match.index),
				stateAfterNestedMode: new State(this, States.Content, '', '', '', '', '')
			};
		}
		return null;
	}

	public configure(options:any): winjs.TPromise<void> {
		if (this.threadService.isInMainThread) {
			return this._configureWorkers(options);
		} else {
			return this._worker((w) => w._doConfigure(options));
		}
	}

	static $_configureWorkers = AllWorkersAttr(HTMLMode, HTMLMode.prototype._configureWorkers);
	private _configureWorkers(options:any): winjs.TPromise<void> {
		return this._worker((w) => w._doConfigure(options));
	}

	static $_provideLinks = OneWorkerAttr(HTMLMode, HTMLMode.prototype._provideLinks);
	protected _provideLinks(resource:URI):winjs.TPromise<modes.ILink[]> {
		return this._worker((w) => w.provideLinks(resource));
	}

	static $_provideDocumentRangeFormattingEdits = OneWorkerAttr(HTMLMode, HTMLMode.prototype._provideDocumentRangeFormattingEdits);
	private _provideDocumentRangeFormattingEdits(resource:URI, range:editorCommon.IRange, options:modes.IFormattingOptions):winjs.TPromise<editorCommon.ISingleEditOperation[]> {
		return this._worker((w) => w.provideDocumentRangeFormattingEdits(resource, range, options));
	}

	static $_provideHover = OneWorkerAttr(HTMLMode, HTMLMode.prototype._provideHover);
	protected _provideHover(resource:URI, position:editorCommon.IPosition): winjs.TPromise<modes.Hover> {
		return this._worker((w) => w.provideHover(resource, position));
	}

	static $_provideReferences = OneWorkerAttr(HTMLMode, HTMLMode.prototype._provideReferences);
	protected _provideReferences(resource:URI, position:editorCommon.IPosition, context: modes.ReferenceContext): winjs.TPromise<modes.Location[]> {
		return this._worker((w) => w.provideReferences(resource, position));
	}

	static $_provideDocumentHighlights = OneWorkerAttr(HTMLMode, HTMLMode.prototype._provideDocumentHighlights);
	protected _provideDocumentHighlights(resource:URI, position:editorCommon.IPosition, strict:boolean = false): winjs.TPromise<modes.DocumentHighlight[]> {
		return this._worker((w) => w.provideDocumentHighlights(resource, position, strict));
	}

	static $_provideCompletionItems = OneWorkerAttr(HTMLMode, HTMLMode.prototype._provideCompletionItems);
	protected _provideCompletionItems(resource:URI, position:editorCommon.IPosition):winjs.TPromise<modes.ISuggestResult[]> {
		return this._worker((w) => w.provideCompletionItems(resource, position));
	}

	static $findColorDeclarations = OneWorkerAttr(HTMLMode, HTMLMode.prototype.findColorDeclarations);
	public findColorDeclarations(resource:URI):winjs.TPromise<{range:editorCommon.IRange; value:string; }[]> {
		return this._worker((w) => w.findColorDeclarations(resource));
	}
}
