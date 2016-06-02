/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import {Promise, TPromise} from 'vs/base/common/winjs.base';
import EventEmitter = require('vs/base/common/eventEmitter');
import Paths = require('vs/base/common/paths');
import URI from 'vs/base/common/uri';
import {NullTelemetryService} from 'vs/platform/telemetry/common/telemetry';
import Storage = require('vs/workbench/common/storage');
import {EditorInputEvent, EditorInput} from 'vs/workbench/common/editor';
import Event, {Emitter} from 'vs/base/common/event';
import Types = require('vs/base/common/types');
import Severity from 'vs/base/common/severity';
import http = require('vs/base/common/http');
import {IConfigurationService} from 'vs/platform/configuration/common/configuration';
import {IStorageService, StorageScope} from 'vs/platform/storage/common/storage';
import WorkbenchEditorService = require('vs/workbench/services/editor/common/editorService');
import QuickOpenService = require('vs/workbench/services/quickopen/common/quickOpenService');
import PartService = require('vs/workbench/services/part/common/partService');
import WorkspaceContextService = require('vs/workbench/services/workspace/common/contextService');
import {IEditorInput, IEditorModel, Position, Direction, IEditor, IResourceInput, ITextEditorModel} from 'vs/platform/editor/common/editor';
import {IEventService} from 'vs/platform/event/common/event';
import {IUntitledEditorService} from 'vs/workbench/services/untitled/common/untitledEditorService';
import {IMessageService, IConfirmation} from 'vs/platform/message/common/message';
import {BaseRequestService} from 'vs/platform/request/common/baseRequestService';
import {IWorkspace, IConfiguration} from 'vs/platform/workspace/common/workspace';
import {ILifecycleService, ShutdownEvent} from 'vs/platform/lifecycle/common/lifecycle';
import {EditorStacksModel} from 'vs/workbench/common/editor/editorStacksModel';
import {ServiceCollection} from 'vs/platform/instantiation/common/serviceCollection';
import {InstantiationService} from 'vs/platform/instantiation/common/instantiationService';

export const TestWorkspace: IWorkspace = {
	resource: URI.file('C:\\testWorkspace'),
	id: 'testWorkspace',
	name: 'Test Workspace',
	uid: new Date().getTime(),
	mtime: new Date().getTime()
};

export const TestConfiguration: IConfiguration = {
	env: Object.create(null)
};

export class TestContextService implements WorkspaceContextService.IWorkspaceContextService {
	public serviceId = WorkspaceContextService.IWorkspaceContextService;

	private workspace: any;
	private configuration: any;
	private options: any;

	constructor(workspace: any = TestWorkspace, configuration: any = TestConfiguration, options: any = null) {
		this.workspace = workspace;
		this.configuration = configuration;
		this.options = options || {
			globalSettings: {
				settings: {}
			}
		};
	}

	public getWorkspace(): IWorkspace {
		return this.workspace;
	}

	public getConfiguration(): IConfiguration {
		return this.configuration;
	}

	public getOptions() {
		return this.options;
	}

	public updateOptions() {

	}

	public isInsideWorkspace(resource: URI): boolean {
		if (resource && this.workspace) {
			return Paths.isEqualOrParent(resource.fsPath, this.workspace.resource.fsPath);
		}

		return false;
	}

	public toWorkspaceRelativePath(resource: URI): string {
		return Paths.makeAbsolute(Paths.normalize(resource.fsPath.substr('c:'.length)));
	}

	public toResource(workspaceRelativePath: string): URI {
		return URI.file(Paths.join('C:\\', workspaceRelativePath));
	}
}

export class TestMessageService implements IMessageService {
	public serviceId = IMessageService;

	private counter: number;

	constructor() {
		this.counter = 0;
	}

	public show(sev: Severity, message: any): () => void {
		this.counter++;

		return null;
	}

	public getCounter() {
		return this.counter;
	}

	public hideAll(): void {
		// No-op
	}

	public confirm(confirmation: IConfirmation): boolean {
		return false;
	}
}

export class TestPartService implements PartService.IPartService {
	public serviceId = PartService.IPartService;

	public layout(): void { }

	public isCreated(): boolean {
		return true;
	}

	public joinCreation(): Promise {
		return TPromise.as(null);
	}

	public hasFocus(part): boolean {
		return false;
	}

	public isVisible(part): boolean {
		return true;
	}

	public isStatusBarHidden(): boolean {
		return false;
	}

	public setStatusBarHidden(hidden: boolean): void { }

	public isSideBarHidden(): boolean {
		return false;
	}

	public setSideBarHidden(hidden: boolean): void { }

	public isPanelHidden(): boolean {
		return false;
	}

	public setPanelHidden(hidden: boolean): void { }

	public getSideBarPosition() {
		return 0;
	}

	public setSideBarPosition(position): void { }
	public addClass(clazz: string): void { }
	public removeClass(clazz: string): void { }
}

export class TestEventService extends EventEmitter.EventEmitter implements IEventService {
	public serviceId = IEventService;
}

export class TestStorageService extends EventEmitter.EventEmitter implements IStorageService {
	public serviceId = IStorageService;

	private storage: Storage.Storage;

	constructor() {
		super();

		let context = new TestContextService();
		this.storage = new Storage.Storage(context, new Storage.InMemoryLocalStorage());
	}

	store(key: string, value: any, scope: StorageScope = StorageScope.GLOBAL): void {
		this.storage.store(key, value, scope);
	}

	swap(key: string, valueA: any, valueB: any, scope: StorageScope = StorageScope.GLOBAL, defaultValue?: any): void {
		this.storage.swap(key, valueA, valueB, scope, defaultValue);
	}

	remove(key: string, scope: StorageScope = StorageScope.GLOBAL): void {
		this.storage.remove(key, scope);
	}

	get(key: string, scope: StorageScope = StorageScope.GLOBAL, defaultValue?: string): string {
		return this.storage.get(key, scope, defaultValue);
	}

	getInteger(key: string, scope: StorageScope = StorageScope.GLOBAL, defaultValue?: number): number {
		return this.storage.getInteger(key, scope, defaultValue);
	}

	getBoolean(key: string, scope: StorageScope = StorageScope.GLOBAL, defaultValue?: boolean): boolean {
		return this.storage.getBoolean(key, scope, defaultValue);
	}
}

export class TestRequestService extends BaseRequestService {

	constructor(workspace = TestWorkspace) {
		super(new TestContextService(), NullTelemetryService);
	}
}

export interface ICustomResponse {
	responseText: string;
	getResponseHeader: (key: string) => string;
}

export interface IMockRequestHandler {
	(url: string): string | ICustomResponse;
}

export class MockRequestService extends BaseRequestService {

	constructor(workspace: any, private handler: IMockRequestHandler) {
		super(new TestContextService(), NullTelemetryService);
	}

	public makeRequest(options: http.IXHROptions): TPromise<http.IXHRResponse> {
		let data = this.handler(options.url);

		if (!data) {
			return super.makeRequest(options);
		}

		let isString = Types.isString(data);
		let responseText = isString ? <string>data : (<ICustomResponse>data).responseText;
		let getResponseHeader = isString ? () => '' : (<ICustomResponse>data).getResponseHeader;

		return TPromise.as<http.IXHRResponse>({
			responseText: responseText,
			status: 200,
			readyState: 4,
			getResponseHeader: getResponseHeader
		});
	}
}

export class TestUntitledEditorService implements IUntitledEditorService {
	public serviceId = IUntitledEditorService;

	public get(resource: URI) {
		return null;
	}

	public getAll() {
		return [];
	}

	public getDirty() {
		return [];
	}

	public isDirty() {
		return false;
	}

	public createOrGet(resource?: URI) {
		return null;
	}

	public hasAssociatedFilePath(resource: URI) {
		return false;
	}
}

export class TestEditorService implements WorkbenchEditorService.IWorkbenchEditorService {
	public serviceId = WorkbenchEditorService.IWorkbenchEditorService;

	public activeEditorInput;
	public activeEditorOptions;
	public activeEditorPosition;

	private callback: (method: string) => void;
	private stacksModel: EditorStacksModel;

	private _onEditorsChanged: Emitter<void>;
	private _onEditorsMoved: Emitter<void>;
	private _onEditorOpening: Emitter<EditorInputEvent>;
	private _onEditorOpenFail: Emitter<IEditorInput>;

	constructor(callback?: (method: string) => void) {
		this.callback = callback || ((s: string) => { });

		this._onEditorsChanged = new Emitter<void>();
		this._onEditorOpening = new Emitter<EditorInputEvent>();
		this._onEditorsMoved = new Emitter<void>();
		this._onEditorOpenFail = new Emitter<IEditorInput>();

		let services = new ServiceCollection();

		services.set(IStorageService, new TestStorageService());
		services.set(WorkspaceContextService.IWorkspaceContextService, new TestContextService());
		const lifecycle = new TestLifecycleService();
		services.set(ILifecycleService, lifecycle);

		let inst = new InstantiationService(services);

		this.stacksModel = inst.createInstance(EditorStacksModel);
	}

	public fireChange(): void {
		this._onEditorsChanged.fire();
	}

	public get onEditorsChanged(): Event<void> {
		return this._onEditorsChanged.event;
	}

	public get onEditorOpening(): Event<EditorInputEvent> {
		return this._onEditorOpening.event;
	}

	public get onEditorsMoved(): Event<void> {
		return this._onEditorsMoved.event;
	}

	public get onEditorOpenFail(): Event<IEditorInput> {
		return this._onEditorOpenFail.event;
	}

	public openEditors(inputs): Promise {
		return TPromise.as([]);
	}

	public replaceEditors(editors): TPromise<IEditor[]> {
		return TPromise.as([]);
	}

	public closeEditors(position: Position, except?: IEditorInput, direction?: Direction): TPromise<void> {
		return TPromise.as(null);
	}

	public closeAllEditors(except?: Position): TPromise<void> {
		return TPromise.as(null);
	}

	public isVisible(input: IEditorInput, includeDiff: boolean): boolean {
		return false;
	}

	public getActiveEditor(): IEditor {
		this.callback('getActiveEditor');

		return null;
	}

	public getActiveEditorInput(): IEditorInput {
		this.callback('getActiveEditorInput');

		return this.activeEditorInput;
	}

	public getVisibleEditors(): IEditor[] {
		this.callback('getVisibleEditors');

		return [];
	}

	public activateGroup(position: Position): void {
		this.callback('activateGroup');
	}

	public pinEditor(position: Position, input: IEditorInput): void {
		this.callback('pinEditor');
	}

	public unpinEditor(position: Position, input: IEditorInput): void {
		this.callback('unpinEditor');
	}

	public moveEditor(input: IEditorInput, from: Position, to: Position, index?: number): void {
		this.callback('moveEditor');
	}

	public moveGroup(from: Position, to: Position): void {
		this.callback('moveGroup');
	}

	public arrangeGroups(arrangement: WorkbenchEditorService.GroupArrangement): void {
		this.callback('arrangeGroups');
	}

	public openEditor(input: any, options?: any, position?: any): Promise {
		this.callback('openEditor');

		this.activeEditorInput = input;
		this.activeEditorOptions = options;
		this.activeEditorPosition = position;

		return TPromise.as(null);
	}

	public resolveEditorModel(input: IEditorInput, refresh?: boolean): TPromise<IEditorModel>;
	public resolveEditorModel(input: IResourceInput, refresh?: boolean): TPromise<ITextEditorModel>;
	public resolveEditorModel(input: any, refresh?: boolean): Promise {
		this.callback('resolveEditorModel');

		return input.resolve(refresh);
	}


	public closeEditor(position: Position, input: IEditorInput): TPromise<void> {
		this.callback('closeEditor');

		return TPromise.as(null);
	}

	public focusGroup(position: Position): void {
		this.callback('focusGroup');
	}

	public createInput(input: IResourceInput): TPromise<IEditorInput> {
		return TPromise.as(null);
	}

	public getStacksModel(): EditorStacksModel {
		return this.stacksModel;
	}
}

export class TestQuickOpenService implements QuickOpenService.IQuickOpenService {
	public serviceId = QuickOpenService.IQuickOpenService;

	private callback: (prefix: string) => void;

	constructor(callback?: (prefix: string) => void) {
		this.callback = callback;
	}

	pick(arg: any, placeHolder?: string, autoFocusFirst?: boolean): Promise {
		return TPromise.as(null);
	}

	input(options?: any): Promise {
		return TPromise.as(null);
	}

	refresh(): Promise {
		return TPromise.as(true);
	}

	show(prefix?: string, options?: any): Promise {
		if (this.callback) {
			this.callback(prefix);
		}

		return TPromise.as(true);
	}

	getEditorHistory(): EditorInput[] {
		return [];
	}

	get onShow(): Event<void> {
		return null;
	}

	get onHide(): Event<void> {
		return null;
	}

	public removeEditorHistoryEntry(input: EditorInput): void { }
	public dispose() { }
	public quickNavigate(): void { }
	public clearEditorHistory(): void { }
}

export const TestFileService = {
	resolveContent: function (resource) {
		return TPromise.as({
			resource: resource,
			value: 'Hello Html',
			etag: 'index.txt',
			mime: 'text/plain',
			encoding: 'utf8',
			mtime: new Date().getTime(),
			name: Paths.basename(resource.fsPath)
		});
	},

	updateContent: function (res) {
		return TPromise.timeout(1).then(() => {
			return {
				resource: res,
				etag: 'index.txt',
				mime: 'text/plain',
				encoding: 'utf8',
				mtime: new Date().getTime(),
				name: Paths.basename(res.fsPath)
			};
		});
	}
};

export class TestConfigurationService extends EventEmitter.EventEmitter implements IConfigurationService {
	public serviceId = IConfigurationService;

	public loadConfiguration<T>(section?: string): TPromise<T> {
		return TPromise.as(this.getConfiguration());
	}

	public getConfiguration(): any {
		return {};
	}

	public hasWorkspaceConfiguration(): boolean {
		return false;
	}

	public onDidUpdateConfiguration() {
		return { dispose() { } };
	}

	public setUserConfiguration(key: any, value: any): Thenable<void> {
		return TPromise.as(null);
	}
}

export class TestLifecycleService implements ILifecycleService {

	public serviceId = ILifecycleService;

	private _onWillShutdown = new Emitter<ShutdownEvent>();
	private _onShutdown = new Emitter<void>();

	constructor() {
	}

	public fireShutdown(): void {
		this._onShutdown.fire();
	}

	public get onWillShutdown(): Event<ShutdownEvent> {
		return this._onWillShutdown.event;
	}

	public get onShutdown(): Event<void> {
		return this._onShutdown.event;
	}
}