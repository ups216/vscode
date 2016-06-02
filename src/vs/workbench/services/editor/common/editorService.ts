/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {TPromise} from 'vs/base/common/winjs.base';
import {createDecorator, ServiceIdentifier} from 'vs/platform/instantiation/common/instantiation';
import {IEditorService, IEditor, IEditorInput, IEditorOptions, Position, Direction, IResourceInput, IEditorModel, ITextEditorModel} from 'vs/platform/editor/common/editor';
import Event from 'vs/base/common/event';
import {EditorInputEvent, IEditorStacksModel} from 'vs/workbench/common/editor';

export enum GroupArrangement {
	MINIMIZE_OTHERS,
	EVEN_WIDTH
}

export var IWorkbenchEditorService = createDecorator<IWorkbenchEditorService>('editorService');

/**
 * The editor service allows to open editors and work on the active
 * editor input and models.
 */
export interface IWorkbenchEditorService extends IEditorService {
	serviceId : ServiceIdentifier<any>;

	/**
	 * Emitted when editors or inputs change. Examples: opening, closing of editors. Active editor change.
	 */
	onEditorsChanged: Event<void>;

	/**
	 * Emitted when an editor is about to open.
	 */
	onEditorOpening: Event<EditorInputEvent>;

	/**
	 * Emitted when a editors are moved to another position.
	 */
	onEditorsMoved: Event<void>;

	/**
	 * Emitted when opening an editor fails.
	 */
	onEditorOpenFail: Event<IEditorInput>;

	/**
	 * Returns the currently active editor or null if none.
	 */
	getActiveEditor(): IEditor;

	/**
	 * Returns the currently active editor input or null if none.
	 */
	getActiveEditorInput(): IEditorInput;

	/**
	 * Returns an array of visible editors.
	 */
	getVisibleEditors(): IEditor[];

	/**
	 * Returns iff the provided input is currently visible.
	 *
	 * @param includeDiff iff set to true, will also consider diff editors to find out if the provided
	 * input is opened either on the left or right hand side of the diff editor.
	 */
	isVisible(input: IEditorInput, includeDiff: boolean): boolean;

	/**
	 * Opens an Editor on the given input with the provided options at the given position. If sideBySide parameter
	 * is provided, causes the editor service to decide in what position to open the input.
	 */
	openEditor(input: IEditorInput, options?: IEditorOptions, position?: Position): TPromise<IEditor>;
	openEditor(input: IEditorInput, options?: IEditorOptions, sideBySide?: boolean): TPromise<IEditor>;

	/**
	 * Specific overload to open an instance of IResourceInput.
	 */
	openEditor(input: IResourceInput, position?: Position): TPromise<IEditor>;
	openEditor(input: IResourceInput, sideBySide?: boolean): TPromise<IEditor>;

	/**
	 * Similar to #openEditor() but allows to open multiple editors for different positions at the same time. If there are
	 * more than one editor per position, only the first one will be active and the others stacked behind inactive.
	 */
	openEditors(editors: { input: IResourceInput, position: Position }[]): TPromise<IEditor[]>;
	openEditors(editors: { input: IEditorInput, position: Position, options?: IEditorOptions }[]): TPromise<IEditor[]>;

	/**
	 * Given a list of editors to replace, will look across all groups where this editor is open (active or hidden)
	 * and replace it with the new editor and the provied options.
	 */
	replaceEditors(editors: { toReplace: IResourceInput, replaceWith: IResourceInput }[]): TPromise<IEditor[]>;
	replaceEditors(editors: { toReplace: IEditorInput, replaceWith: IEditorInput, options?: IEditorOptions }[]): TPromise<IEditor[]>;

	/**
	 * Closes the editor at the provided position.
	 */
	closeEditor(position: Position, input: IEditorInput): TPromise<void>;

	/**
	 * Closes editors of a specific group at the provided position. If the optional editor is provided to exclude, it
	 * will not be closed. The direction can be used in that case to control if all other editors should get closed,
	 * or towards a specific direction.
	 */
	closeEditors(position: Position, except?: IEditorInput, direction?: Direction): TPromise<void>;

	/**
	 * Closes all editors across all groups. The optional position allows to keep one group alive.
	 */
	closeAllEditors(except?: Position): TPromise<void>;

	/**
	 * Adds the pinned state to an editor, removing it from being a preview editor.
	 */
	pinEditor(position: Position, input: IEditorInput): void;

	/**
	 * Removes the pinned state of an editor making it a preview editor.
	 */
	unpinEditor(position: Position, input: IEditorInput): void;

	/**
	 * Keyboard focus the editor group at the provided position.
	 */
	focusGroup(position: Position): void;

	/**
	 * Activate the editor group at the provided position without moving focus.
	 */
	activateGroup(position: Position): void;

	/**
	 * Moves an editor from one group to another. The index in the group is optional.
	 */
	moveEditor(input: IEditorInput, from: Position, to: Position, index?: number): void;

	/**
	 * Allows to move the editor group from one position to another.
	 */
	moveGroup(from: Position, to: Position): void;

	/**
	 * Allows to arrange editor groups according to the GroupArrangement enumeration.
	 */
	arrangeGroups(arrangement: GroupArrangement): void;

	/**
	 * Resolves an input to its model representation. The optional parameter refresh allows to specify
	 * if a cached model should be returned (false) or a new version (true). The default is returning a
	 * cached version.
	 */
	resolveEditorModel(input: IEditorInput, refresh?: boolean): TPromise<IEditorModel>;

	/**
	 * Specific overload to resolve a IResourceInput to an editor model with a text representation.
	 */
	resolveEditorModel(input: IResourceInput, refresh?: boolean): TPromise<ITextEditorModel>;

	/**
	 * Allows to resolve an untyped input to a workbench typed instanceof editor input
	 */
	createInput(input: IResourceInput): TPromise<IEditorInput>;

	/**
	 * Provides access to the editor stacks model
	 */
	getStacksModel(): IEditorStacksModel;
}