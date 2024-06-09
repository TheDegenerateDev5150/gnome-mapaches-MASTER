/* -*- Mode: JS2; indent-tabs-mode: nil; js2-basic-offset: 4 -*- */
/* vim: set et ts=4 sw=4: */
/*
 * GNOME Maps is free software; you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by the
 * Free Software Foundation; either version 2 of the License, or (at your
 * option) any later version.
 *
 * GNOME Maps is distributed in the hope that it will be useful, but
 * WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY
 * or FITNESS FOR A PARTICULAR PURPOSE.  See the GNU General Public License
 * for more details.
 *
 * You should have received a copy of the GNU General Public License along
 * with GNOME Maps; if not, see <http://www.gnu.org/licenses/>.
 *
 * Author: Jonas Danielson <jonas@threetimestwo.org>
 */

import Cairo from 'cairo';
import Gdk from 'gi://Gdk';
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import GObject from 'gi://GObject';
import Graphene from 'gi://Graphene';
import Gsk from 'gi://Gsk';
import Gtk from 'gi://Gtk';
import Pango from 'gi://Pango';

import * as Utils from './utils.js';

const _PREVIEW_WIDTH = 150;

export class ExportViewDialog extends Gtk.Dialog {

    static Response = {
        SUCCESS: 0,
        CANCEL: 1
    };

    constructor({
        paintable,
        latitude,
        longitude,
        mapView,
        width,
        height,
        ...params
    }) {
        super({...params, use_header_bar: true});

        this._paintable = paintable;
        this._mapView = mapView;
        this._width = width;
        this._height = height;
        this._cancelButton.connect('clicked', () => this.response(ExportViewDialog.Response.CANCEL));
        this._exportButton.connect('clicked', () => this._exportView());

        this._folder = GLib.get_user_special_dir(GLib.UserDirectory.DIRECTORY_PICTURES);
        if (!this._folder)
            this._folder = GLib.get_user_data_dir();

        this._fileName =
            this._getName(latitude, longitude);
        this._setupPreviewArea();
    }

    _getName(latitude, longitude) {
        /* Translators: This is a format string for a PNG filename for an
         * exported image with coordinates. The .png extension should be kept
         * intact in the translated string.
         */
        return _("Maps at %f, %f.png").format(latitude.toFixed(2),
                                              longitude.toFixed(2));
    }

    _setupPreviewArea() {
        this._scaleFactor = _PREVIEW_WIDTH / this._width;
        let previewHeight = this._height * this._scaleFactor;

        this._previewArea.width_request = _PREVIEW_WIDTH;
        this._previewArea.height_request = previewHeight;
        this._previewArea.paintable = this._paintable;
    }

    _exportView() {
        let fileDialog = new Gtk.FileDialog({ initialName: this._fileName,
                                              initialFolder: Gio.File.new_for_path(this._folder) });

        fileDialog.save(this.transient_for, null, (fileDialog, response) => {
            try {
                let file = fileDialog.save_finish(response);
                
                let rect = new Graphene.Rect();

                rect.init(0, 0, this._width, this._height);

                let snapshot = Gtk.Snapshot.new();

                this._paintable.snapshot(snapshot,
                                        this._paintable.get_intrinsic_width(),
                                        this._paintable.get_intrinsic_height());

                // render license text
                const pCtx = this._mapView.create_pango_context();
                const layout = Pango.Layout.new(pCtx);

                layout.set_markup(this._mapView.mapSource.license, -1);

                const [textWidth, textHeight] = layout.get_pixel_size();
                const textRect = new Graphene.Rect();
                const textPoint = new Graphene.Point();

                textRect.init(this._width - textWidth, this._height - textHeight,
                            textWidth, textHeight);
                textPoint.init(this._width - textWidth, this._height - textHeight);

                snapshot.append_color(new Gdk.RGBA({ red: 1, green: 1, blue: 1, alpha: 0.5 }),
                                    textRect);
                snapshot.translate(textPoint);
                snapshot.append_layout(layout,
                                    new Gdk.RGBA({ red: 0, green: 0, blue: 0, alpha: 1 }));

                let node = snapshot.to_node();
                let renderer = this._mapView.get_native().get_renderer();
                let texture = renderer.render_texture(node, rect);

                let success = texture.save_to_png(file.get_path());

                if (success) {
                    this.response(ExportViewDialog.Response.SUCCESS);
                } else {
                    this.transient_for.showToast(_("Unable to export view"));
                    this.response(ExportViewDialog.Response.CANCEL);
                }
            } catch {
                this.response(ExportViewDialog.Response.CANCEL);
            }
        });
    }
}

GObject.registerClass({
    Template: 'resource:///org/gnome/Maps/ui/export-view-dialog.ui',
    InternalChildren: [ 'exportButton',
                        'cancelButton',
                        'previewArea'],
}, ExportViewDialog);
