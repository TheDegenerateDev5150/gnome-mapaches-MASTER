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
 * Author: Hashem Nasarat <hashem@riseup.net>
 */

import GObject from 'gi://GObject';
import Shumate from 'gi://Shumate';

import {GeoJSONSource} from './geoJSONSource.js';
import {ShapeLayer} from './shapeLayer.js';
import * as Utils from './utils.js';
import * as Togeojson from './togeojson/togeojson.js';
import * as Domparser from './xmldom/domparser.js';

export class KmlShapeLayer extends ShapeLayer {

    static mimeTypes = ['application/vnd.google-earth.kml+xml'];
    static displayName = 'KML';

    static createInstance(params) {
        return new KmlShapeLayer(params);
    }

    constructor(params) {
        super(params);

        this._mapSource = new GeoJSONSource({ mapView: this._mapView,
                                              markerLayer: this._markerLayer });
        this._overlayLayer =
            new Shumate.MapLayer({ map_source: this._mapSource,
                                   viewport:   this._mapView.map.viewport });
    }

    _parseContent() {
        let s = Utils.getBufferText(this._fileContents);
        let parser = new Domparser.DOMParser();
        let json = Togeojson.toGeoJSON.kml(parser.parseFromString(s));
        this._mapSource.parse(json);
    }
}

GObject.registerClass(KmlShapeLayer);
