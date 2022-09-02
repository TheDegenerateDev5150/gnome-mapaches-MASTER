/* -*- Mode: JS2; indent-tabs-mode: nil; js2-basic-offset: 4 -*- */
/* vim: set et ts=4 sw=4: */
/*
 * Copyright (c) 2014 Damián Nohales
 *
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
 * Author: Damián Nohales <damiannohales@gmail.com>
 */

import Cairo from 'cairo';
import Gdk from 'gi://Gdk';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Graphene from 'gi://Graphene';
import Gtk from 'gi://Gtk';
import Shumate from 'gi://Shumate';

import {Application} from './application.js';
import {MapBubble} from './mapBubble.js';
import {MapWalker} from './mapWalker.js';
import * as Utils from './utils.js';

export class MapMarker extends Shumate.Marker {

    constructor(params) {
        let place = params.place;
        delete params.place;

        let mapView = params.mapView;
        delete params.mapView;

        params.latitude = place.location.latitude;
        params.longitude = place.location.longitude;
        params.selectable = true;

        super(params);

        this._place = place;
        this._mapView = mapView;

        this._image = new Gtk.Image({ icon_size: Gtk.IconSize.NORMAL });
        this.child = this._image;

        if (this._mapView) {
            this._viewport = this._mapView.map.viewport;

            this._buttonPressGesture = new Gtk.GestureSingle();
            this.add_controller(this._buttonPressGesture);
            this._buttonPressGesture.connect('begin',
                                             () => this._onMarkerSelected());

            // Some markers are draggable, we want to sync the marker location and
            // the location saved in the GeocodePlace
            // These are not bindings because the place may have a different
            // location later
            this.connect('notify::latitude', () => {
                this.place.location.latitude = this.latitude;
            });
            this.connect('notify::longitude', () => {
                this.place.location.longitude = this.longitude;
            });

            this.place.connect('notify::location', this._onLocationChanged.bind(this));

            this._viewport.bind_property('latitude', this, 'view-latitude',
                                         GObject.BindingFlags.DEFAULT);
            this._viewport.bind_property('longitude', this, 'view-longitude',
                                         GObject.BindingFlags.DEFAULT);
            this._viewport.bind_property('zoom-level', this, 'view-zoom-level',
                                         GObject.BindingFlags.DEFAULT);
            this.connect('notify::view-latitude', this._onViewUpdated.bind(this));
            this.connect('notify::view-longitude', this._onViewUpdated.bind(this));
            this.connect('notify::view-zoom-level', this._onViewUpdated.bind(this));
        }

        Application.application.connect('notify::adaptive-mode', this._onAdaptiveModeChanged.bind(this));
    }

    _onButtonPress(marker, event) {
        // Zoom in on marker on double-click
        if (event.get_click_count() > 1) {
            if (this._view.zoom_level < this._view.max_zoom_level) {
                this._view.zoom_level = this._view.max_zoom_level;
                this._view.center_on(this.latitude, this.longitude);
            }
        }
    }

    _onLocationChanged() {
        this.set_location(this.place.location.latitude, this.place.location.longitude);

        if (this._bubble) {
            if (this._isInsideView())
                this._positionBubble(this._bubble);
            else
                this.hideBubble();
        }
    }

    /**
     * Returns: The anchor point for the marker icon, relative to the
     * top left corner.
     */
    get anchor() {
        return { x: 0, y: 0 };
    }

    get bubbleSpacing() {
        return 0;
    }

    get place() {
        return this._place;
    }

    get bubble() {
        if (this._bubble === undefined && this._hasBubble()) {
            if (this._place.name) {
                this._bubble = new MapBubble({ place: this._place,
                                               mapView: this._mapView });
                this._bubble.set_parent(this._mapView);
            }
        }

        return this._bubble;
    }

    _hasBubble() {
        // Markers has no associated bubble by default
        return false;
    }

    _positionBubble(bubble) {
        let [x, y] =
            this._viewport.location_to_widget_coords(this._mapView.map,
                                                     this.latitude,
                                                     this.longitude);
        let mapSize = this._mapView.map.get_allocation();

        let pos = new Gdk.Rectangle({ x: x - this.bubbleSpacing,
                                      y: y - this.bubbleSpacing,
                                      width: this.width + this.bubbleSpacing * 2,
                                      height: this.height + this.bubbleSpacing * 2 });
        bubble.pointing_to = pos;
        bubble.position = Gtk.PositionType.TOP;

        // Gtk+ doesn't provide a widget allocation by calling get_allocation
        // if it's not visible, the bubble positioning occurs when bubble
        // is not visible yet
        let bubbleSize = bubble.get_preferred_size()[1];

        // Set bubble position left/right if it's close to a vertical map edge
        if (pos.x + pos.width / 2 + bubbleSize.width / 2 >= mapSize.width)
            bubble.position = Gtk.PositionType.LEFT;
        else if (pos.x + pos.width / 2 - bubbleSize.width / 2 <= 0)
            bubble.position = Gtk.PositionType.RIGHT;
        // Avoid bubble to cover header bar if the marker is close to the top map edge
        else if (pos.y - bubbleSize.height <= 0)
            bubble.position = Gtk.PositionType.BOTTOM;
    }

    _hideBubbleOn(signal, duration) {
        let sourceId = null;
        let signalId = this._viewport.connect(signal, () => {
            if (sourceId)
                GLib.source_remove(sourceId);
            else
                this.hideBubble();

            let callback = (function() {
                sourceId = null;
                this.showBubble();
            }).bind(this);

            if (duration)
                sourceId = GLib.timeout_add(null, duration, callback);
            else
                sourceId = GLib.idle_add(null, callback);
        });

        Utils.once(this.bubble, 'closed', () => {
            // We still listening for the signal to refresh
            // the existent timeout
            if (!sourceId)
                this._viewport.disconnect(signalId);
        });
    }

    _initBubbleSignals() {
        this._hideBubbleOn('notify::zoom-level', 500);
        this._hideBubbleOn('notify::size');

        // This is done to get just one marker selected at any time regardless
        // of the layer to which it belongs so we can get only one visible bubble
        // at any time. We do this for markers in different layers because for
        // markers in the same layer, ChamplainMarkerLayer single selection mode
        // does the job.
        this._mapView.onSetMarkerSelected(this);

        let markerSelectedSignalId = this._mapView.connect('marker-selected', (mapView, selectedMarker) => {
            if (this.get_parent() !== selectedMarker.get_parent())
                this.selected = false;
        });

        let goingToSignalId = this._mapView.connect('going-to', () => {
            this.set_selected(false);
        });

        Utils.once(this.bubble, 'closed', () => {
            this._mapView.disconnect(markerSelectedSignalId);
            this._mapView.disconnect(goingToSignalId);
        });
    }

    _isInsideView() {
        let [x, y] = this._viewport.location_to_widget_coords(this._mapView.map,
                                                              this.latitude,
                                                              this.longitude);
        let markerSize = this.get_allocation();
        let mapSize = this._mapView.map.get_allocation();
        let tx = markerSize.width / 2;
        let ty = markerSize.height / 2;

        return x + tx/2 > 0 && x - tx/2 < mapSize.width &&
               y + ty/2 > 0 && y - ty/2 < mapSize.height;
    }

    _onViewUpdated() {
        if (this.bubble) {
            if (this._isInsideView())
                this._positionBubble(this.bubble);
            else
                this.bubble.hide();
        }
    }

    showBubble() {
        if (this.bubble && !this.bubble.visible && this._isInsideView() && !Application.application.adaptive_mode) {
            this._initBubbleSignals();
            this.bubble.popup();
            this._positionBubble(this.bubble);
        }
    }

    hideBubble() {
        if (this._bubble)
            this._bubble.popdown();
    }

    get walker() {
        if (this._walker === undefined)
            this._walker = new MapWalker(this.place, this._mapView);

        return this._walker;
    }

    zoomToFit() {
        this.walker.zoomToFit();
    }

    goTo(animate) {
        Utils.once(this.walker, 'gone-to', () => this.emit('gone-to'));
        this.walker.goTo(animate);
    }

    goToAndSelect(animate) {
        Utils.once(this, 'gone-to', () => {
            if (this.bubble)
                this.showBubble();
        });

        this.goTo(animate);
    }

    _onMarkerSelected() {
        if (this.bubble) {
            if (!this._bubble.visible) {
                this.showBubble();
                Application.application.selected_place = this._place;
            } else {
                this.hideBubble();
                Application.application.selected_place = null;
            }
        } else {
            if (!Application.application.selected_place)
                Application.application.selected_place = this._place;
            else
                Application.application.selected_place = null;
        }
    }

    _onAdaptiveModeChanged() {
        if (!Application.application.adaptive_mode) {
            this.showBubble();
        } else {
            this.hideBubble();
        }
    }

    _paintableFromIconName(name, size, color) {
        let display = Gdk.Display.get_default();
        let theme = Gtk.IconTheme.get_for_display(display);
        let iconPaintable = theme.lookup_icon(name, null, size,
                                              this.scale_factor,
                                              Gtk.TextDirection.NONE, 0);

        if (color) {
            let snapshot = Gtk.Snapshot.new();
            let rect = new Graphene.Rect();

            iconPaintable.snapshot_symbolic(snapshot, size, size, [color]);
            rect.init(0, 0, size, size);

            let node = snapshot.to_node();
            let renderer = this._mapView.get_native().get_renderer();

            return renderer.render_texture(node, rect);
        } else {
            return iconPaintable;
        }
    }
}

GObject.registerClass({
    Abstract: true,
    Signals: {
        'gone-to': { }
    },
    Properties: {
        'view-latitude': GObject.ParamSpec.double('view-latitude', '', '',
                                                  GObject.ParamFlags.READABLE |
                                                  GObject.ParamFlags.WRITABLE,
                                                  -90, 90, 0),
        'view-longitude': GObject.ParamSpec.double('view-longitude', '', '',
                                                   GObject.ParamFlags.READABLE |
                                                   GObject.ParamFlags.WRITABLE,
                                                   -180, 180, 0),
        'view-zoom-level': GObject.ParamSpec.int('view-zoom-level', '', '',
                                                 GObject.ParamFlags.READABLE |
                                                 GObject.ParamFlags.WRITABLE,
                                                 0, 20, 3)
    }
}, MapMarker);
