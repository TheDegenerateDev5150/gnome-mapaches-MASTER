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
 * Author: Jonas Danielsson <jonas@threetimestwo.org>
 */

import Adw from 'gi://Adw';
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import Shumate from 'gi://Shumate';
import GnomeMaps from 'gi://GnomeMaps';

import * as Utils from './utils.js';
import { generateMapStyle } from './mapStyle/mapStyle.js';

export function createVectorSource() {
    const start = GLib.get_monotonic_time();
    const style = generateMapStyle({
        colorScheme: Adw.StyleManager.get_default().dark ? "dark" : "light",
        language: Utils.getLanguage(),
        textScale: Adw.LengthUnit.to_px(Adw.LengthUnit.SP, 1, null),
    });
    const end = GLib.get_monotonic_time();
    Utils.debug(`Map style generated in ${(end - start) / 1000} ms.`);

    const source = Shumate.VectorRenderer.new("vector-tiles", JSON.stringify(style));
    source.set_license("© OpenMapTiles © OpenStreetMap contributors");
    source.set_license_uri("https://www.openstreetmap.org/copyright");

    const sprites = Shumate.VectorSpriteSheet.new();
    const spriteSource = new GnomeMaps.SpriteSource({"color-scheme": "light"});
    const [_status4, shieldsJsonFile] = Gio.file_new_for_uri('resource://org/gnome/Maps/shields/shields.json').load_contents(null);
    spriteSource.load_shield_defs(Utils.getBufferText(shieldsJsonFile));
    spriteSource.set_fallback(sprites);
    source.set_sprite_sheet(sprites);

    return source;
}
