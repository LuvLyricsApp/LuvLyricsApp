package com.lyricflow.app.modules

import android.view.View
import com.lyricflow.app.views.LuvsPagerView
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * Exposes [LuvsPagerView] to JS as `<LuvsPager>`.
 *
 * The GroupView block is what keeps React Native and ViewPager2 from fighting:
 * RN's view manager asks us for children instead of walking the Android hierarchy,
 * so it never sees the RecyclerView holders the pages actually live in.
 */
class LuvsPagerModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("LuvsPager")

    View(LuvsPagerView::class) {
      Events("onPageSelected", "onPageScrollStateChanged")

      Prop("scrollEnabled") { view: LuvsPagerView, enabled: Boolean? ->
        view.scrollEnabled = enabled ?: true
      }

      Prop("hapticsOnSettle") { view: LuvsPagerView, enabled: Boolean? ->
        view.hapticsOnSettle = enabled ?: true
      }

      Prop("depthEffect") { view: LuvsPagerView, enabled: Boolean? ->
        view.depthEffect = enabled ?: true
      }

      Prop("offscreenPages") { view: LuvsPagerView, count: Int? ->
        view.offscreenPages = count ?: 2
      }

      AsyncFunction("setPage") { view: LuvsPagerView, index: Int, animated: Boolean ->
        view.setPage(index, animated)
      }

      AsyncFunction("getCurrentPage") { view: LuvsPagerView ->
        view.currentPage()
      }

      GroupView<LuvsPagerView> {
        AddChildView<View> { parent, child, index -> parent.addPage(child, index) }
        GetChildCount { parent -> parent.pageCount() }
        GetChildViewAt<View> { parent, index -> parent.pageAt(index) }
        RemoveChildViewAt { parent, index -> parent.removePageAt(index) }
        RemoveChildView<View> { parent, child -> parent.removePage(child) }
      }
    }
  }
}
