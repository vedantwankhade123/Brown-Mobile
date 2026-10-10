package com.brown.mobile

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.ColorFilter
import android.graphics.Paint
import android.graphics.PixelFormat
import android.graphics.Rect
import android.graphics.RectF
import android.graphics.drawable.Drawable

/** Center the mark and wordmark independently without modifying the supplied artwork. */
class CenteredBrandDrawable(private val bitmap: Bitmap) : Drawable() {
  private val paint = Paint(Paint.ANTI_ALIAS_FLAG or Paint.FILTER_BITMAP_FLAG)
  private val regions: List<Rect> = findBrandRegions()
  override fun getIntrinsicWidth() = bitmap.width
  override fun getIntrinsicHeight() = bitmap.height

  private fun findBrandRegions(): List<Rect> {
    val pixels = IntArray(bitmap.width * bitmap.height)
    bitmap.getPixels(pixels, 0, bitmap.width, 0, 0, bitmap.width, bitmap.height)
    val regions = mutableListOf<Rect>()
    var region: Rect? = null
    for (y in 0 until bitmap.height) {
      var left = bitmap.width
      var right = -1
      for (x in 0 until bitmap.width) {
        val color = pixels[y * bitmap.width + x]
        if (Color.alpha(color) > 32 && maxOf(Color.red(color), Color.green(color), Color.blue(color)) > 80) {
          left = minOf(left, x); right = maxOf(right, x)
        }
      }
      if (right >= left) {
        if (region == null) region = Rect(left, y, right + 1, y + 1)
        else { region.left = minOf(region.left, left); region.right = maxOf(region.right, right + 1); region.bottom = y + 1 }
      } else if (region != null) { regions.add(region); region = null }
    }
    if (region != null) regions.add(region)
    return regions
  }

  override fun draw(canvas: Canvas) {
    val scale = minOf(bounds.width().toFloat() / bitmap.width, bounds.height().toFloat() / bitmap.height)
    canvas.save()
    canvas.translate(bounds.exactCenterX(), bounds.exactCenterY())
    canvas.scale(scale, scale)
    if (regions.size == 2) {
      val groupCenterY = (regions.first().top + regions.last().bottom) / 2f
      for (source in regions) {
        val target = RectF(-source.width() / 2f, source.top - groupCenterY, source.width() / 2f, source.bottom - groupCenterY)
        canvas.drawBitmap(bitmap, source, target, paint)
      }
    } else canvas.drawBitmap(bitmap, -bitmap.width / 2f, -bitmap.height / 2f, paint)
    canvas.restore()
  }
  override fun setAlpha(alpha: Int) { paint.alpha = alpha; invalidateSelf() }
  override fun setColorFilter(filter: ColorFilter?) { paint.colorFilter = filter; invalidateSelf() }
  @Deprecated("Drawable opacity") override fun getOpacity() = PixelFormat.TRANSLUCENT
}
