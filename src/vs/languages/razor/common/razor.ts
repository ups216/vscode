/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import modes = require('vs/editor/common/modes');
import htmlMode = require('vs/languages/html/common/html');
import csharpTokenization = require('vs/languages/razor/common/csharpTokenization');
import {createWordRegExp, ModeWorkerManager} from 'vs/editor/common/modes/abstractMode';
import razorTokenTypes = require('vs/languages/razor/common/razorTokenTypes');
import {RAZORWorker} from 'vs/languages/razor/common/razorWorker';
import {IInstantiationService} from 'vs/platform/instantiation/common/instantiation';
import {IModeService} from 'vs/editor/common/services/modeService';
import {RichEditSupport} from 'vs/editor/common/modes/supports/richEditSupport';
import {ILeavingNestedModeData} from 'vs/editor/common/modes/supports/tokenizationSupport';
import {IThreadService} from 'vs/platform/thread/common/thread';
import {wireCancellationToken} from 'vs/base/common/async';

// for a brief description of the razor syntax see http://www.mikesdotnetting.com/Article/153/Inline-Razor-Syntax-Overview

class RAZORState extends htmlMode.State {

	constructor(mode:modes.IMode, kind:htmlMode.States, lastTagName:string, lastAttributeName:string, embeddedContentType:string, attributeValueQuote:string, attributeValue:string) {
		super(mode, kind, lastTagName, lastAttributeName, embeddedContentType, attributeValueQuote, attributeValue);
	}

	public makeClone():RAZORState {
		return new RAZORState(this.getMode(), this.kind, this.lastTagName, this.lastAttributeName, this.embeddedContentType, this.attributeValueQuote, this.attributeValue);
	}

	public equals(other:modes.IState):boolean {
		if (other instanceof RAZORState) {
			return (
				super.equals(other)
			);
		}
		return false;
	}

	public tokenize(stream:modes.IStream):modes.ITokenizationResult {

		if (!stream.eos() && stream.peek() === '@') {
			stream.next();
			if (!stream.eos() && stream.peek() === '*') {
				return { nextState: new csharpTokenization.CSComment(this.getMode(), this, '@') };
			}
			if (stream.eos() || stream.peek() !== '@') {
				return { type: razorTokenTypes.EMBED_CS, nextState: new csharpTokenization.CSStatement(this.getMode(), this, 0, 0, true, true, true, false) };
			}
		}

		return super.tokenize(stream);
	}
}

export class RAZORMode extends htmlMode.HTMLMode<RAZORWorker> {

	constructor(
		descriptor:modes.IModeDescriptor,
		@IInstantiationService instantiationService: IInstantiationService,
		@IModeService modeService: IModeService,
		@IThreadService threadService: IThreadService
	) {
		super(descriptor, instantiationService, modeService, threadService);
	}

	protected _registerSupports(): void {
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

		modes.LinkProviderRegistry.register(this.getId(), {
			provideLinks: (model, token): Thenable<modes.ILink[]> => {
				return wireCancellationToken(token, this._provideLinks(model.uri));
			}
		}, true);
	}

	protected _createModeWorkerManager(descriptor:modes.IModeDescriptor, instantiationService: IInstantiationService): ModeWorkerManager<RAZORWorker> {
		return new ModeWorkerManager<RAZORWorker>(descriptor, 'vs/languages/razor/common/razorWorker', 'RAZORWorker', 'vs/languages/html/common/htmlWorker', instantiationService);
	}

	protected _createRichEditSupport(): modes.IRichEditSupport {
		return new RichEditSupport(this.getId(), null, {

			wordPattern: createWordRegExp('#?%'),

			comments: {
				blockComment: ['<!--', '-->']
			},

			brackets: [
				['<!--', '-->'],
				['{', '}'],
				['(', ')']
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
					beforeText: new RegExp(`<(?!(?:${htmlMode.EMPTY_ELEMENTS.join('|')}))(\\w[\\w\\d]*)([^/>]*(?!/)>)[^<]*$`, 'i'),
					afterText: /^<\/(\w[\w\d]*)\s*>$/i,
					action: { indentAction: modes.IndentAction.IndentOutdent }
				},
				{
					beforeText: new RegExp(`<(?!(?:${htmlMode.EMPTY_ELEMENTS.join('|')}))(\\w[\\w\\d]*)([^/>]*(?!/)>)[^<]*$`, 'i'),
					action: { indentAction: modes.IndentAction.Indent }
				}
			],
		});
	}

	public getInitialState(): modes.IState {
		return new RAZORState(this, htmlMode.States.Content, '', '', '', '', '');
	}

	public getLeavingNestedModeData(line:string, state:modes.IState): ILeavingNestedModeData {
		var leavingNestedModeData = super.getLeavingNestedModeData(line, state);
		if (leavingNestedModeData) {
			leavingNestedModeData.stateAfterNestedMode = new RAZORState(this, htmlMode.States.Content, '', '', '', '', '');
		}
		return leavingNestedModeData;
	}
}
