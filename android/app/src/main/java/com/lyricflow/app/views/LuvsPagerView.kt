package com.lyricflow.app.views

import android.content.Context
import android.view.HapticFeedbackConstants
import android.view.View
import android.view.ViewGroup
import android.widget.FrameLayout
import androidx.recyclerview.widget.RecyclerView
import androidx.viewpager2.widget.ViewPager2
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.viewevent.EventDispatcher
import expo.modules.kotlin.views.ExpoView
import kotlin.math.abs

/**
 * Vertical reels pager backed by a real ViewPager2.
 *
 * The point of doing this natively is the fling: ViewPager2 snaps on the platform's
 * own scroller, so one flick moves exactly one page and settles on the next frame.
 * A JS `pagingEnabled` FlatList has to round-trip the scroll offset through the
 * bridge before it knows which page won, which is what made the old feed feel mushy.
 *
 * React Native children are handed to us one page at a time (see the `GroupView`
 * block in [com.lyricflow.app.modules.LuvsPagerModule]); we keep them in [pages] and
 * hand them to the adapter. They are never reported back to RN as Android children,
 * so RN's view manager and the RecyclerView never fight over the same view.
 */
class LuvsPagerView(context: Context, appContext: AppContext) : ExpoView(context, appContext) {

  // ViewPager2 is not laid out by RN — it isn't in RN's tree — so Android has to do it.
  override val shouldUseAndroidLayout: Boolean = true

  private val onPageSelected by EventDispatcher<Map<String, Any>>()
  private val onPageScrollStateChanged by EventDispatcher<Map<String, Any>>()

  private val pager = ViewPager2(context)
  private val pages = mutableListOf<View>()

  /**
   * A stable per-page token. RecyclerView keys its holders off these, so a page keeps
   * its holder when songs are appended ahead of or behind it. Without this, appending
   * to the feed re-binds already-visible pages and the artwork flashes.
   */
  private val pageIds = mutableListOf<Long>()
  private var nextPageId = 0L

  private val adapter = PageAdapter()

  /** Fires a tick as each page locks in — the small haptic reels feeds are built on. */
  var hapticsOnSettle: Boolean = true

  /** Scale/fade the neighbouring pages as they slide past. */
  var depthEffect: Boolean = true
    set(value) {
      field = value
      pager.setPageTransformer(if (value) depthTransformer else null)
    }

  /**
   * ViewPager2 clamps this to >= 1 internally when a transformer is set. Two is the
   * sweet spot: the next card is already measured and drawn before the finger lifts,
   * so a fast swipe never lands on an empty page.
   */
  var offscreenPages: Int = 2
    set(value) {
      field = value
      pager.offscreenPageLimit = value.coerceAtLeast(1)
    }

  var scrollEnabled: Boolean = true
    set(value) {
      field = value
      pager.isUserInputEnabled = value
    }

  private val depthTransformer = ViewPager2.PageTransformer { page, position ->
    // `position` is 0 for the settled page, -1 for the one fully above, +1 below.
    val clamped = position.coerceIn(-1f, 1f)
    val distance = abs(clamped)
    page.scaleX = 1f - 0.07f * distance
    page.scaleY = 1f - 0.07f * distance
    page.alpha = 1f - 0.65f * distance
    // Counter-drift: the outgoing card lags slightly behind the finger, which reads
    // as depth rather than as two flat pages sliding.
    page.translationY = -clamped * page.height * 0.08f
  }

  init {
    pager.orientation = ViewPager2.ORIENTATION_VERTICAL
    pager.adapter = adapter
    pager.offscreenPageLimit = offscreenPages
    pager.setPageTransformer(depthTransformer)

    // The stretch/glow overscroll on the inner RecyclerView reads as a bug in a
    // full-bleed feed — the artwork visibly detaches from the screen edge.
    (pager.getChildAt(0) as? RecyclerView)?.overScrollMode = View.OVER_SCROLL_NEVER

    pager.registerOnPageChangeCallback(object : ViewPager2.OnPageChangeCallback() {
      override fun onPageSelected(position: Int) {
        if (hapticsOnSettle) {
          pager.performHapticFeedback(HapticFeedbackConstants.CLOCK_TICK)
        }
        this@LuvsPagerView.onPageSelected(mapOf("position" to position))
      }

      override fun onPageScrollStateChanged(state: Int) {
        val name = when (state) {
          ViewPager2.SCROLL_STATE_DRAGGING -> "dragging"
          ViewPager2.SCROLL_STATE_SETTLING -> "settling"
          else -> "idle"
        }
        this@LuvsPagerView.onPageScrollStateChanged(mapOf("state" to name))
      }
    })

    // `super.addView` on purpose: this is a real Android child, but RN must not see it.
    super.addView(
      pager,
      LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT)
    )
  }

  // ─── Child management, driven by the module's GroupView block ────────────────

  fun addPage(child: View, index: Int) {
    val at = index.coerceIn(0, pages.size)
    pages.add(at, child)
    pageIds.add(at, nextPageId++)
    adapter.notifyItemInserted(at)
  }

  fun pageCount(): Int = pages.size

  fun pageAt(index: Int): View? = pages.getOrNull(index)

  fun removePageAt(index: Int) {
    val child = pages.getOrNull(index) ?: return
    detach(child)
    pages.removeAt(index)
    pageIds.removeAt(index)
    adapter.notifyItemRemoved(index)
  }

  fun removePage(child: View) {
    val index = pages.indexOf(child)
    if (index != -1) removePageAt(index)
  }

  private fun detach(child: View) {
    (child.parent as? ViewGroup)?.removeView(child)
  }

  // ─── Imperative API ──────────────────────────────────────────────────────────

  fun setPage(index: Int, animated: Boolean) {
    if (index < 0 || index >= pages.size) return
    pager.setCurrentItem(index, animated)
  }

  fun currentPage(): Int = pager.currentItem

  // ─── Adapter ─────────────────────────────────────────────────────────────────

  private inner class PageHolder(val container: FrameLayout) : RecyclerView.ViewHolder(container)

  private inner class PageAdapter : RecyclerView.Adapter<PageHolder>() {
    init {
      setHasStableIds(true)
    }

    override fun getItemCount(): Int = pages.size

    override fun getItemId(position: Int): Long = pageIds[position]

    /**
     * One view type per page, so RecyclerView never recycles a holder across
     * positions. These are React-owned views — swapping one into another page's slot
     * would show the wrong song under the right index.
     */
    override fun getItemViewType(position: Int): Int = pageIds[position].toInt()

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): PageHolder {
      val container = FrameLayout(parent.context).apply {
        layoutParams = RecyclerView.LayoutParams(
          RecyclerView.LayoutParams.MATCH_PARENT,
          RecyclerView.LayoutParams.MATCH_PARENT
        )
      }
      return PageHolder(container)
    }

    override fun onBindViewHolder(holder: PageHolder, position: Int) {
      val page = pages.getOrNull(position) ?: return
      if (page.parent === holder.container) return
      detach(page)
      holder.container.removeAllViews()
      holder.container.addView(
        page,
        FrameLayout.LayoutParams(
          FrameLayout.LayoutParams.MATCH_PARENT,
          FrameLayout.LayoutParams.MATCH_PARENT
        )
      )
    }

    override fun onViewRecycled(holder: PageHolder) {
      // Hand the page back before the holder is reused, so RN's view manager can
      // still find and remove it if the feed shrinks underneath us.
      holder.container.removeAllViews()
    }
  }
}
