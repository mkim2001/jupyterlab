// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import { IWidgetTracker, WidgetTracker } from '@jupyterlab/apputils';

import {
  MimeDocumentFactory,
  DocumentRegistry,
  MimeDocument
} from '@jupyterlab/docregistry';

import { IRenderMimeRegistry } from '@jupyterlab/rendermime';

import { IRenderMime } from '@jupyterlab/rendermime-interfaces';

import { LabIcon } from '@jupyterlab/ui-components';

import { Token } from '@lumino/coreutils';

import { AttachedProperty } from '@lumino/properties';

import { JupyterFrontEnd, JupyterFrontEndPlugin } from './index';

import { ILayoutRestorer } from './layoutrestorer';

/**
 * A class that tracks mime documents.
 */
export interface IMimeDocumentTracker extends IWidgetTracker<MimeDocument> {}

/* tslint:disable */
/**
 * The mime document tracker token.
 */
export const IMimeDocumentTracker = new Token<IMimeDocumentTracker>(
  '@jupyterlab/application:IMimeDocumentTracker'
);
/* tslint:enable */

/**
 * Create rendermime plugins for rendermime extension modules.
 */
export function createRendermimePlugins(
  extensions: IRenderMime.IExtensionModule[]
): JupyterFrontEndPlugin<void | IMimeDocumentTracker>[] {
  const plugins: JupyterFrontEndPlugin<void | IMimeDocumentTracker>[] = [];

  const namespace = 'application-mimedocuments';
  const tracker = new WidgetTracker<MimeDocument>({ namespace });

  extensions.forEach(mod => {
    let data = mod.default;

    // Handle CommonJS exports.
    if (!mod.hasOwnProperty('__esModule')) {
      data = mod as any;
    }
    if (!Array.isArray(data)) {
      data = [data] as ReadonlyArray<IRenderMime.IExtension>;
    }
    (data as ReadonlyArray<IRenderMime.IExtension>).forEach(item => {
      plugins.push(createRendermimePlugin(tracker, item));
    });
  });

  // Also add a meta-plugin handling state restoration
  // and exposing the mime document widget tracker.
  plugins.push({
    id: '@jupyterlab/application:mimedocument',
    optional: [ILayoutRestorer],
    provides: IMimeDocumentTracker,
    autoStart: true,
    activate: (app: JupyterFrontEnd, restorer: ILayoutRestorer | null) => {
      if (restorer) {
        void restorer.restore(tracker, {
          command: 'docmanager:open',
          args: widget => ({
            path: widget.context.path,
            factory: Private.factoryNameProperty.get(widget)
          }),
          name: widget =>
            `${widget.context.path}:${Private.factoryNameProperty.get(widget)}`
        });
      }
      return tracker;
    }
  });

  return plugins;
}

/**
 * Create rendermime plugins for rendermime extension modules.
 */
export function createRendermimePlugin(
  tracker: WidgetTracker<MimeDocument>,
  item: IRenderMime.IExtension
): JupyterFrontEndPlugin<void> {
  return {
    id: item.id,
    requires: [IRenderMimeRegistry],
    autoStart: true,
    activate: (app: JupyterFrontEnd, rendermime: IRenderMimeRegistry) => {
      // Add the mime renderer.
      if (item.rank !== undefined) {
        rendermime.addFactory(item.rendererFactory, item.rank);
      } else {
        rendermime.addFactory(item.rendererFactory);
      }

      // Handle the widget factory.
      if (!item.documentWidgetFactoryOptions) {
        return;
      }

      let registry = app.docRegistry;
      let options: IRenderMime.IDocumentWidgetFactoryOptions[] = [];
      if (Array.isArray(item.documentWidgetFactoryOptions)) {
        options = item.documentWidgetFactoryOptions;
      } else {
        options = [
          item.documentWidgetFactoryOptions as IRenderMime.IDocumentWidgetFactoryOptions
        ];
      }

      if (item.fileTypes) {
        item.fileTypes.forEach(ft => {
          if (ft.icon) {
            // upconvert the contents of the icon field to a proper LabIcon
            ft = { ...ft, icon: LabIcon.resolve({ icon: ft.icon }) };
          }

          app.docRegistry.addFileType(ft as DocumentRegistry.IFileType);
        });
      }

      options.forEach(option => {
        const toolbarFactory = option.toolbarFactory
          ? (w: MimeDocument) => option.toolbarFactory!(w.content.renderer)
          : undefined;
        let factory = new MimeDocumentFactory({
          renderTimeout: item.renderTimeout,
          dataType: item.dataType,
          rendermime,
          modelName: option.modelName,
          name: option.name,
          primaryFileType: registry.getFileType(option.primaryFileType),
          fileTypes: option.fileTypes,
          defaultFor: option.defaultFor,
          defaultRendered: option.defaultRendered,
          toolbarFactory
        });
        registry.addWidgetFactory(factory);

        factory.widgetCreated.connect((sender, widget) => {
          Private.factoryNameProperty.set(widget, factory.name);
          // Notify the widget tracker if restore data needs to update.
          widget.context.pathChanged.connect(() => {
            void tracker.save(widget);
          });
          void tracker.add(widget);
        });
      });
    }
  };
}

/**
 * Private namespace for the module.
 */
namespace Private {
  /**
   * An attached property for keeping the factory name
   * that was used to create a mimedocument.
   */
  export const factoryNameProperty = new AttachedProperty<
    MimeDocument,
    string | undefined
  >({
    name: 'factoryName',
    create: () => undefined
  });
}
