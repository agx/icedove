/* -*- Mode: Java; c-basic-offset: 4; tab-width: 20; indent-tabs-mode: nil; -*-
 * ***** BEGIN LICENSE BLOCK *****
 * Version: MPL 1.1/GPL 2.0/LGPL 2.1
 *
 * The contents of this file are subject to the Mozilla Public License Version
 * 1.1 (the "License"); you may not use this file except in compliance with
 * the License. You may obtain a copy of the License at
 * http://www.mozilla.org/MPL/
 *
 * Software distributed under the License is distributed on an "AS IS" basis,
 * WITHOUT WARRANTY OF ANY KIND, either express or implied. See the License
 * for the specific language governing rights and limitations under the
 * License.
 *
 * The Original Code is Mozilla Android code.
 *
 * The Initial Developer of the Original Code is Mozilla Foundation.
 * Portions created by the Initial Developer are Copyright (C) 2009-2010
 * the Initial Developer. All Rights Reserved.
 *
 * Contributor(s):
 *   Patrick Walton <pcwalton@mozilla.com>
 *   Arkady Blyakher <rkadyb@mit.edu>
 *
 * Alternatively, the contents of this file may be used under the terms of
 * either the GNU General Public License Version 2 or later (the "GPL"), or
 * the GNU Lesser General Public License Version 2.1 or later (the "LGPL"),
 * in which case the provisions of the GPL or the LGPL are applicable instead
 * of those above. If you wish to allow use of your version of this file only
 * under the terms of either the GPL or the LGPL, and not to allow others to
 * use your version of this file under the terms of the MPL, indicate your
 * decision by deleting the provisions above and replace them with the notice
 * and other provisions required by the GPL or the LGPL. If you do not delete
 * the provisions above, a recipient may use your version of this file under
 * the terms of any one of the MPL, the GPL or the LGPL.
 *
 * ***** END LICENSE BLOCK ***** */

package org.mozilla.gecko.gfx;

import org.mozilla.gecko.gfx.CairoImage;
import org.mozilla.gecko.gfx.CairoUtils;
import org.mozilla.gecko.gfx.IntSize;
import org.mozilla.gecko.gfx.LayerController;
import org.mozilla.gecko.gfx.TileLayer;
import android.graphics.Rect;
import android.graphics.RectF;
import android.graphics.Region;
import android.graphics.RegionIterator;
import android.opengl.GLES20;
import android.util.Log;
import java.nio.FloatBuffer;
import javax.microedition.khronos.opengles.GL10;

/**
 * Encapsulates the logic needed to draw a single textured tile.
 *
 * TODO: Repeating textures really should be their own type of layer.
 */
public class SingleTileLayer extends TileLayer {
    private static final String LOGTAG = "GeckoSingleTileLayer";

    private Rect mMask;

    public SingleTileLayer(CairoImage image) { this(false, image); }

    public SingleTileLayer(boolean repeat, CairoImage image) {
        super(image, repeat ? TileLayer.PaintMode.REPEAT : TileLayer.PaintMode.NORMAL);
    }

    public SingleTileLayer(CairoImage image, TileLayer.PaintMode paintMode) {
        super(image, paintMode);
    }

    /**
     * Set an area to mask out when rendering.
     */
    public void setMask(Rect aMaskRect) {
        mMask = aMaskRect;
    }

    @Override
    public void draw(RenderContext context) {
        // mTextureIDs may be null here during startup if Layer.java's draw method
        // failed to acquire the transaction lock and call performUpdates.
        if (!initialized())
            return;

        RectF bounds;
        RectF textureBounds;
        RectF viewport = context.viewport;

        if (repeats()) {
            // If we're repeating, we want to adjust the texture bounds so that
            // the texture repeats the correct number of times when drawn at
            // the size of the viewport.
            bounds = getBounds(context);
            textureBounds = new RectF(0.0f, 0.0f, bounds.width(), bounds.height());
            bounds = new RectF(0.0f, 0.0f, viewport.width(), viewport.height());
        } else if (stretches()) {
            // If we're stretching, we just want the bounds and texture bounds
            // to fit to the page.
            bounds = new RectF(context.pageRect);
            textureBounds = bounds;
        } else {
            bounds = getBounds(context);
            textureBounds = bounds;
        }

        Rect intBounds = new Rect();
        bounds.roundOut(intBounds);
        Region maskedBounds = new Region(intBounds);
        if (mMask != null) {
            maskedBounds.op(mMask, Region.Op.DIFFERENCE);
            if (maskedBounds.isEmpty())
                return;
        }

        // XXX Possible optimisation here, form this array so we can draw it in
        //     a single call.
        RegionIterator i = new RegionIterator(maskedBounds);
        for (Rect subRect = new Rect(); i.next(subRect);) {
            // Compensate for rounding errors at the edge of the tile caused by
            // the roundOut above
            RectF subRectF = new RectF(Math.max(bounds.left, (float)subRect.left),
                                       Math.max(bounds.top, (float)subRect.top),
                                       Math.min(bounds.right, (float)subRect.right),
                                       Math.min(bounds.bottom, (float)subRect.bottom));

            // This is the left/top/right/bottom of the rect, relative to the
            // bottom-left of the layer, to use for texture coordinates.
            int[] cropRect = new int[] { Math.round(subRectF.left - bounds.left),
                                         Math.round(bounds.bottom - subRectF.top),
                                         Math.round(subRectF.right - bounds.left),
                                         Math.round(bounds.bottom - subRectF.bottom) };

            float left = subRectF.left - viewport.left;
            float top = viewport.bottom - subRectF.bottom;
            float right = left + subRectF.width();
            float bottom = top + subRectF.height();

            float[] coords = {
                //x, y, z, texture_x, texture_y
                left/viewport.width(), bottom/viewport.height(), 0,
                cropRect[0]/textureBounds.width(), cropRect[1]/textureBounds.height(),

                left/viewport.width(), top/viewport.height(), 0,
                cropRect[0]/textureBounds.width(), cropRect[3]/textureBounds.height(),

                right/viewport.width(), bottom/viewport.height(), 0,
                cropRect[2]/textureBounds.width(), cropRect[1]/textureBounds.height(),

                right/viewport.width(), top/viewport.height(), 0,
                cropRect[2]/textureBounds.width(), cropRect[3]/textureBounds.height()
            };

            FloatBuffer coordBuffer = context.coordBuffer;
            int positionHandle = context.positionHandle;
            int textureHandle = context.textureHandle;

            GLES20.glBindTexture(GLES20.GL_TEXTURE_2D, getTextureID());

            // Make sure we are at position zero in the buffer
            coordBuffer.position(0);
            coordBuffer.put(coords);

            // Unbind any the current array buffer so we can use client side buffers
            GLES20.glBindBuffer(GLES20.GL_ARRAY_BUFFER, 0);

            // Vertex coordinates are x,y,z starting at position 0 into the buffer.
            coordBuffer.position(0);
            GLES20.glVertexAttribPointer(positionHandle, 3, GLES20.GL_FLOAT, false, 20, coordBuffer);

            // Texture coordinates are texture_x, texture_y starting at position 3 into the buffer.
            coordBuffer.position(3);
            GLES20.glVertexAttribPointer(textureHandle, 2, GLES20.GL_FLOAT, false, 20, coordBuffer);
            GLES20.glDrawArrays(GLES20.GL_TRIANGLE_STRIP, 0, 4);
        }
    }
}

