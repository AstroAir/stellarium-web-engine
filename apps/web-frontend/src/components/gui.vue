// Stellarium Web - Copyright (c) 2022 - Stellarium Labs SRL
//
// This program is licensed under the terms of the GNU AGPL v3, or
// alternatively under a commercial licence.
//
// The terms of the AGPL v3 license can be found in the main directory of this
// repository.

<template>

<div class="click-through" style="position:absolute; width: 100%; height: 100%; display:flex; align-items: flex-end;">
  <toolbar v-if="$store.state.showMainToolBar" class="get-click"></toolbar>
  <observing-panel></observing-panel>
  <template v-for="(item, i) in pluginsGuiComponents">
    <component :is="item" :key="i"></component>
  </template>
  <template v-for="(item, i) in dialogs">
    <component :is="item" :key="i + pluginsGuiComponents.length"></component>
  </template>
  <selected-object-info style="position: absolute; top: 48px; left: 0px; width: 380px; max-width: calc(100vw - 12px); margin: 6px" class="get-click"></selected-object-info>
  <progress-bars style="position: absolute; bottom: 54px; right: 12px;"></progress-bars>
  <bottom-bar style="position:absolute; width: 100%; justify-content: center; bottom: 0; display:flex; margin-bottom: 0px" class="get-click"></bottom-bar>

  <!-- FPS Display -->
  <div v-if="$store.state.showFPS" class="fps-display">
    <span>FPS: {{ fps }}</span>
    <span v-if="avgFrameTime">| {{ avgFrameTime.toFixed(1) }}ms</span>
  </div>

  <!-- Performance Warning -->
  <div v-if="showPerformanceWarning" class="performance-warning get-click">
    <v-alert type="warning" dense dismissible @input="dismissPerformanceWarning">
      {{ $t('Low performance detected. Consider reducing quality in View Settings.') }}
    </v-alert>
  </div>
</div>

</template>

<script>
import Toolbar from '@/components/toolbar.vue'
import BottomBar from '@/components/bottom-bar.vue'
import SelectedObjectInfo from '@/components/selected-object-info.vue'
import ProgressBars from '@/components/progress-bars'

import DataCreditsDialog from '@/components/data-credits-dialog.vue'
import ViewSettingsDialog from '@/components/view-settings-dialog.vue'
import PlanetsVisibility from '@/components/planets-visibility.vue'
import LocationDialog from '@/components/location-dialog.vue'
import ObservingPanel from '@/components/observing-panel.vue'

export default {
  data: function () {
    return {
      showPerformanceWarning: false,
      performanceWarningDismissed: false
    }
  },
  methods: {
    dismissPerformanceWarning: function () {
      this.showPerformanceWarning = false
      this.performanceWarningDismissed = true
    },
    checkPerformance: function () {
      if (this.performanceWarningDismissed) return
      if (this.$store.state.stel && this.$store.state.stel.fps) {
        const fps = this.$store.state.stel.fps
        if (fps > 0 && fps < 20) {
          this.showPerformanceWarning = true
        } else if (fps >= 30) {
          this.showPerformanceWarning = false
        }
      }
    }
  },
  computed: {
    fps: function () {
      return this.$store.state.stel ? this.$store.state.stel.fps : 0
    },
    avgFrameTime: function () {
      return this.$store.state.stel ? this.$store.state.stel.avg_frame_time : 0
    },
    pluginsGuiComponents: function () {
      let res = []
      for (const i in this.$stellariumWebPlugins()) {
        const plugin = this.$stellariumWebPlugins()[i]
        if (plugin.guiComponents) {
          res = res.concat(plugin.guiComponents)
        }
      }
      return res
    },
    dialogs: function () {
      let res = [
        'data-credits-dialog',
        'view-settings-dialog',
        'planets-visibility',
        'location-dialog'
      ]
      for (const i in this.$stellariumWebPlugins()) {
        const plugin = this.$stellariumWebPlugins()[i]
        if (plugin.dialogs) {
          res = res.concat(plugin.dialogs.map(d => d.name))
        }
      }
      return res
    }
  },
  watch: {
    fps: function () {
      this.checkPerformance()
    }
  },
  components: { Toolbar, BottomBar, DataCreditsDialog, ViewSettingsDialog, PlanetsVisibility, SelectedObjectInfo, LocationDialog, ProgressBars, ObservingPanel }
}
</script>

<style>
.fps-display {
  position: absolute;
  top: 8px;
  right: 8px;
  background: rgba(0, 0, 0, 0.7);
  color: #00ff00;
  padding: 4px 8px;
  border-radius: 4px;
  font-family: monospace;
  font-size: 12px;
  z-index: 100;
}

.performance-warning {
  position: absolute;
  top: 60px;
  right: 8px;
  max-width: 300px;
  z-index: 100;
}
</style>
