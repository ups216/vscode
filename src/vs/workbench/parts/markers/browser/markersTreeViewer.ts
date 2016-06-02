/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {TPromise, Promise} from 'vs/base/common/winjs.base';
import * as dom from 'vs/base/browser/dom';
import {IDataSource, ITree, IRenderer} from 'vs/base/parts/tree/browser/tree';
import { IActionRunner } from 'vs/base/common/actions';
import Severity from 'vs/base/common/severity';
import {IWorkspaceContextService} from 'vs/workbench/services/workspace/common/contextService';
import { ActionProvider } from 'vs/workbench/parts/markers/browser/markersActionProvider';
import { CountBadge } from 'vs/base/browser/ui/countBadge/countBadge';
import { FileLabel } from 'vs/base/browser/ui/fileLabel/fileLabel';
import { IMarker } from 'vs/platform/markers/common/markers';
import { MarkersModel, Resource, Marker } from 'vs/workbench/parts/markers/common/markersModel';
import MarkersStatisticsWidget from 'vs/workbench/parts/markers/browser/markersStatisticsWidget';
import Messages from 'vs/workbench/parts/markers/common/messages';

interface IResourceTemplateData {
	file: FileLabel;
	statistics: MarkersStatisticsWidget;
	count: CountBadge;
}

interface IMarkerTemplateData {
	icon: HTMLElement;
	label: HTMLElement;
}

export class DataSource implements IDataSource {
	public getId(tree: ITree, element: any): string {
		if (element instanceof MarkersModel) {
			return 'root';
		}
		if (element instanceof Resource) {
			return element.uri.toString();
		}
		if (element instanceof Marker) {
			return (<Marker>element).id;
		}
		return '';
	}

	public hasChildren(tree: ITree, element: any): boolean {
		return element instanceof MarkersModel || element instanceof Resource;
	}

	public getChildren(tree: ITree, element: any): Promise {
		if (element instanceof MarkersModel) {
			return TPromise.as((<MarkersModel>element).getFilteredResources());
		}
		if (element instanceof Resource) {
			return TPromise.as(element.markers);
		}
		return null;
	}

	public getParent(tree: ITree, element: any): Promise {
		return TPromise.as(null);
	}
}

export class Renderer implements IRenderer {

	private static RESOURCE_TEMPLATE_ID= 'resource-template';
	private static MARKER_TEMPLATE_ID= 'marker-template';

	constructor(private actionRunner: IActionRunner,
				private actionProvider:ActionProvider,
				@IWorkspaceContextService private contextService: IWorkspaceContextService
	) {
	}

	public getHeight(tree:ITree, element:any): number {
		return 22;
	}

	public getTemplateId(tree:ITree, element:any): string {
		if (element instanceof Resource) {
			return Renderer.RESOURCE_TEMPLATE_ID;
		}
		if (element instanceof Marker) {
			return Renderer.MARKER_TEMPLATE_ID;
		}
		return '';
	}

	public renderTemplate(tree: ITree, templateId: string, container: HTMLElement): any {
		switch (templateId) {
			case Renderer.RESOURCE_TEMPLATE_ID:
				return this.renderResourceTemplate(container);
			case Renderer.MARKER_TEMPLATE_ID:
				return this.renderMarkerTemplate(container);
		}
	}

	private renderResourceTemplate(container: HTMLElement): IResourceTemplateData {
		var data: IResourceTemplateData = Object.create(null);
		data.file = new FileLabel(container, null, this.contextService);

		// data.statistics= new MarkersStatisticsWidget(dom.append(container, dom.emmet('.marker-stats')));

		const badgeWrapper = dom.append(container, dom.emmet('.count-badge-wrapper'));
		data.count = new CountBadge(badgeWrapper);

		return data;
	}

	private renderMarkerTemplate(container: HTMLElement): IMarkerTemplateData {
		var data: IMarkerTemplateData = Object.create(null);
		data.icon = dom.append(container, dom.emmet('.marker-icon'));
		data.label = dom.append(container, dom.emmet('span.label'));
		return data;
	}

	public renderElement(tree: ITree, element: any, templateId: string, templateData: any): void {
		switch (templateId) {
			case Renderer.RESOURCE_TEMPLATE_ID:
				return this.renderResourceElement(tree, <Resource> element, templateData);
			case Renderer.MARKER_TEMPLATE_ID:
				return this.renderMarkerElement(tree, (<Marker>element).marker, templateData);
		}
	}

	private renderResourceElement(tree: ITree, element: Resource, templateData: IResourceTemplateData) {
		templateData.file.setValue(element.uri);
		// templateData.statistics.setStatistics(element.statistics);
		templateData.count.setCount(element.markers.length);
	}

	private renderMarkerElement(tree: ITree, element: IMarker, templateData: IMarkerTemplateData) {
		templateData.icon.className = 'icon ' + Renderer.iconClassNameFor(element);
		templateData.label.textContent = Messages.MARKERS_PANEL_AT_LINE_NUMBER(element.startLineNumber) + element.message;
	}

	private static iconClassNameFor(element: IMarker): string {
		switch (element.severity) {
			case Severity.Ignore:
				return 'info';
			case Severity.Info:
				return 'info';
			case Severity.Warning:
				return 'warning';
			case Severity.Error:
				return 'error';
		}
		return '';
	}

	public disposeTemplate(tree: ITree, templateId: string, templateData: any): void {
	}
}